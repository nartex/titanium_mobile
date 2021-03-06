/*
 * install.js: Titanium iOS CLI install hook
 *
 * Copyright (c) 2012-2014, Appcelerator, Inc.  All Rights Reserved.
 * See the LICENSE file for more information.
 */

var appc = require('node-appc'),
	async = require('async'),
	fs = require('fs'),
	ioslib = require('ioslib'),
	path = require('path'),
	run = appc.subprocess.run,
	__ = appc.i18n(__dirname).__;

exports.cliVersion = '>=3.2';

exports.init = function (logger, config, cli) {
	cli.addHook('build.post.compile', {
		priority: 8000,
		post: function (builder, finished) {
			if (cli.argv.target !== 'device') return finished();

			var devices = {};

			async.parallel([
				function (next) {
					var pkgapp = path.join(builder.xcodeEnv.path, 'Platforms', 'iPhoneOS.platform', 'Developer', 'usr', 'bin', 'PackageApplication');
					if (fs.existsSync(pkgapp)) {
						run(pkgapp, builder.xcodeAppDir, function (code, out, err) {
							if (code) {
								logger.warn(__('An error occurred running the iOS Package Application tool'));
								err.split('\n').forEach(logger.debug);
							}
							next();
						});
					} else {
						logger.warn(__('Unable to locate iOS Package Application tool'));
						next();
					}
				},
				function (next) {
					ioslib.device.detect(function (err, results) {
						if (!err) {
							results.devices.forEach(function (device) {
								if (device.udid !== 'itunes') {
									devices[device.udid] = device;
								}
							});
						}
						next();
					});
				}
			], function () {
				var ipa = path.join(path.dirname(builder.xcodeAppDir), builder.tiapp.name + '.ipa');
				fs.existsSync(ipa) || (ipa = builder.xcodeAppDir);

				if (cli.argv['build-only']) {
					logger.info(__('Performed build only, skipping installing of the application'));
					return finished();
				}

				// if we don't have a deviceId, or it's "itunes", or it's "all", but not devices are connected,
				// then install to iTunes
				if (!builder.deviceId || builder.deviceId === 'itunes' || (builder.deviceId === 'all' && !Object.keys(devices).length)) {
					logger.info(__('Installing application into iTunes'));

					run('open', ['-b', 'com.apple.itunes', ipa], function (code, out, err) {
						if (code) {
							return finished(new appc.exception(__('Failed to launch iTunes')));
						}

						logger.info(__('Initiating iTunes sync'));
						run('osascript', path.join(builder.titaniumIosSdkPath, 'itunes_sync.scpt'), function (code, out, err) {
							if (code) {
								if (err.indexOf('(-1708)') !== -1) {
									// err == "itunes_sync.scpt: execution error: iTunes got an error: every source doesn’t understand the count message. (-1708)"
									// TODO: alert that the EULA needs to be accepted and if prompting is enabled,
									// then wait for them to accept it and then try again
									finished(new appc.exception(__('Failed to initiate iTunes sync'), err.split('\n').filter(function (line) { return !!line.length; })));
								} else {
									finished(new appc.exception(__('Failed to initiate iTunes sync'), err.split('\n').filter(function (line) { return !!line.length; })));
								}
							} else {
								finished();
							}
						});
					});
				} else {
					var udids = Object.keys(devices),
						levels = logger.getLevels(),
						logLevelRE = new RegExp('^(\u001b\\[\\d+m)?\\[?(' + levels.join('|') + '|log|timestamp)\\]?\s*(\u001b\\[\\d+m)?(.*)', 'i'),
						startLog = false,
						running = 0;

					function quit(force) {
						if (force || (running <= 0 && startLog)) {
							var endLogTxt = __('End application log');
							logger.log(('-- ' + endLogTxt + ' ' + (new Array(75 - endLogTxt.length)).join('-')).grey + '\n');
							process.exit(0);
						}
					}

					// install the app for the specified device or "all" devices
					async.series(udids.map(function (udid) {
						var device = devices[udid];

						if (builder.deviceId !== 'all' && builder.deviceId !== device.udid) return;

						return function (next) {
							var lastLogger = 'debug';

							logger.info(__('Installing app on device: %s', device.name.cyan));

							ioslib.device.install(udid, builder.xcodeAppDir, builder.tiapp.id, {
								appName: builder.tiapp.name
							}).on('installed', function () {
								logger.info(__('App successfully installed on device: %s', device.name.cyan));
								next && next();
								next = null;
								setTimeout(function () {
									if (process.env.STUDIO_VERSION) {
										logger.log(__('Please manually launch the application').magenta + '\n');
									} else {
										logger.log(__('Please manually launch the application or press CTRL-C to quit').magenta + '\n');
									}
								}, 50);
							}).on('appStarted', function () {
								if (!startLog) {
									var startLogTxt = __('Start application log');
									logger.log(('-- ' + startLogTxt + ' ' + (new Array(75 - startLogTxt.length)).join('-')).grey);
									startLog = true;
								}
								running++;
							}).on('log', function (msg) {
								var m = msg.match(logLevelRE);
								if (m) {
									var line = m[0].trim();
									m = line.match(logLevelRE);
									if (m) {
										lastLogger = m[2].toLowerCase();
										line = m[4].trim();
									}
									if (levels.indexOf(lastLogger) === -1) {
										// unknown log level
										logger.log(('[' + lastLogger.toUpperCase() + '] ').cyan + line);
									} else {
										logger[lastLogger](line);
									}
									lastLineWasOurs = true;
								} else {
									if (levels.indexOf(lastLogger) === -1) {
										logger.log(('[' + lastLogger.toUpperCase() + '] ').cyan + msg);
									} else {
										logger[lastLogger](msg);
									}
								}
							}).on('appQuit', function () {
								running--;
								quit();
							}).on('error', function (err) {
								err = err.message || err;
								logger.error(err);
								if (err.indexOf('0xe8008017') !== -1) {
									logger.error(__('Chances are there is a signing issue with your provisioning profile or the generated app is not compatible with your device'));
								}
								next && next(err);
								next = null;
							});
						};
					}), finished);

					// listen for ctrl-c
					process.on('SIGINT', function () {
						logger.log();
						quit(true);
					});
				}
			});
		}
	});
};