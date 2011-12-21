define("Ti/_/UI/Element",
	["Ti/_/browser", "Ti/_/css", "Ti/_/declare", "Ti/_/dom", "Ti/_/lang", "Ti/_/style", "Ti/_/Evented"],
	function(browser, css, declare, dom, lang, style, Evented) {

	var undef,
		unitize = dom.unitize,
		on = require.on,
		transitionEvents = {
			webkit: "webkitTransitionEnd",
			trident: "msTransitionEnd",
			gecko: "transitionend",
			presto: "oTransitionEnd"
		},
		transitionEnd = transitionEvents[browser.runtime] || "transitionEnd";

	return declare("Ti._.UI.Element", Evented, {

		domType: null,
		domNode: null,
		parent: null,

		constructor: function() {
			var bgSelPrevColor,
				bgSelPrevImage,
				bgFocusPrevColor;

			this.domNode = dom.create(this.domType || "div", {
				className: "TiUIElement " + css.clean(this.declaredClass)
			});

			// TODO: mixin JSS rules (http://jira.appcelerator.org/browse/TIMOB-6780)

			on(this.domNode, "focus", lang.hitch(this, function() {
				var tmp, node = this.domNode;

				this._origBg = style.get(node, ["backgroundColor", "backgroundImage"]);

				(tmp = this.backgroundSelectedColor) && style.set(node, "backgroundColor", tmp);
				(tmp = this.backgroundSelectedImage) && style.set(node, "backgroundImage", style.url(tmp));

				if (this.focusable) {
					(tmp = this.backgroundFocusedColor) && style.set(node, "backgroundColor", tmp);
					(tmp = this.backgroundFocusedImage) && style.set(node, "backgroundImage", style.url(tmp));
				}
			}));

			on(this.domNode, "blur", function() {
				var bg = (this._origBg || []).concat([0, 0]);

				this.focusable && this.backgroundSelectedColor && (bg[0] = this.backgroundSelectedColor);
				bg[0] && style.set(this.domNode, "backgroundColor", bg[0]);

				this.focusable && this.backgroundSelectedImage && (bg[1] = this.backgroundSelectedImage);
				bg[1] && style.set(this.domNode, "backgroundImage", style.url(bg[1]));
			});
		},

		destroy: function() {
			dom.destroy(this.domNode);
			this.domNode = null;
		},
		
		doLayout: function() {
			this._layout && this._layout.doLayout(this);
		},

		show: function() {
			this.visible = true;
			//this.fireEvent("ti:shown");
		},

		hide: function() {
			this.visible = false;
			//obj.fireEvent("ti:hidden");
		},

		animate: function(anim, callback) {
			var curve = "ease",
				fn = lang.hitch(this, function() {
					var transform = "";

					// Set the color and opacity properties
					anim.backgroundColor !== undef && (obj.backgroundColor = anim.backgroundColor);
					anim.opacity !== undef && style.set(this.domNode, "opacity", anim.opacity);
					style.set(this.domNode, "display", anim.visible !== undef && !anim.visible ? "none" : "");

					// Set the position and size properties
					require.each(["top", "bottom", "left", "right", "height", "width"], function(p) {
						anim[p] !== undef && style.set(this.domNode, p, unitize(anim[p]));
					});

					// Set the z-order
					anim.zIndex !== undef && style.set(this.domNode, "zIndex", anim.zIndex);

					// Set the transform properties
					if (anim.transform) {
						curTransform = curTransform ? curTransform.multiply(anim.transform) : anim.transform;
						transform = curTransform.toCSS();
					}

					style.set("transform", transform);
				});

			switch (anim.curve) {
				case Ti.ui.ANIMATION_CURVE_LINEAR: curve = "linear"; break;
				case Ti.ui.ANIMATION_CURVE_EASE_IN: curve = "ease-in"; break;
				case Ti.ui.ANIMATION_CURVE_EASE_OUT: curve = "ease-out"; break
				case Ti.ui.ANIMATION_CURVE_EASE_IN_OUT: curve = "ease-in-out";
			}

			anim.duration = anim.duration || 0;
			anim.delay = anim.delay || 0;

			// Determine which coordinates are valid and combine with previous coordinates where appropriate.
			if (anim.center) {
				anim.left = anim.center.x - this.domNode.offsetWidth / 2;
				anim.top = anim.center.y - this.domNode.offsetHeight / 2;
			}

			anim.transform && style.set("transform", "");

			if (anim.duration > 0) {
				// Create the transition, must be set before setting the other properties
				style.set("transition", "all " + anim.duration + "ms " + curve + (anim.delay ? " " + anim.delay + "ms" : ""));
				callback && on.once(window, transitionEnd, function(e) {
					// Clear the transform so future modifications in these areas are not animated
					style.set("transition", "");
					callback();
				});
				setTimeout(fn, 0);
			} else {
				fn();
				callback && callback();
			}
		},

		properties: {
			
			// Properties that are handled by the element
			backgroundColor: {
				set: function(value) {
					return style.set(this.domNode, "backgroundColor", value);
				}
			},
			backgroundFocusedColor: undef,
			backgroundFocusedImage: undef,
			backgroundGradient: {
				set: function(value) {
					var value = value || {},
						output = [],
						colors = value.colors || [],
						type = value.type,
						start = value.startPoint,
						end = value.endPoint;

					if (type === "linear") {
						start && end && start.x != end.x && start.y != end.y && output.concat([
							unitize(value.startPoint.x) + " " + unitize(value.startPoint.y),
							unitize(value.endPoint.x) + " " + unitize(value.startPoint.y)
						]);
					} else if (type === "radial") {
						start = value.startRadius;
						end = value.endRadius;
						start && end && output.push(unitize(start) + " " + unitize(end));
						output.push("ellipse closest-side");
					} else {
						style.set(this.domNode, "backgroundImage", "none");
						return;
					}

					require.each(colors, function(c) {
						output.push(c.color ? c.color + " " + (c.position * 100) + "%" : c);
					});

					output = type + "-gradient(" + output.join(",") + ")";

					require.each(vendorPrefixes.css, function(p) {
						style.set(this.domNode, "backgroundImage", p + output);
					});

					return value;
				}
			},
			backgroundImage: {
				set: function(value) {
					return style.set(this.domNode, "backgroundImage", value ? style.url(value) : "");
				}
			},
			backgroundSelectedColor: undef,
			backgroundSelectedImage: undef,
			borderColor: {
				set: function(value) {
					if (style.set(this.domNode, "borderColor", value)) {
						this.borderWidth | 0 || (this.borderWidth = 1);
						style.set(this.domNode, "borderStyle", "solid");
					} else {
						this.borderWidth = 0;
					}
					return value;
				}
			},
			borderRadius: {
				set: function(value) {
					style.set(this.domNode, "borderRadius", unitize(value));
					return value;
				}
			},
			borderWidth: {
				set: function(value) {
					style.set(this.domNode, "borderWidth", unitize(value));
					this.borderColor || style.set(this.domNode, "borderColor", "black");
					style.set(this.domNode, "borderStyle", "solid");
					return value;
				}
			},
			color: {
				set: function(value) {
					return style.set(this.domNode, "color", value);
				}
			},
			focusable: undef,
			font: {
				set: function(value) {
					value = value || {};
					require.each(["fontVariant", "fontStyle", "fontWeight", "fontSize", "fontFamily"], function(f) {
						f in value && (value[f] = style.set(this.domNode, f, f === "fontSize" ? unitize(value[f]) : value[f]));
					});
					return value;
				}
			},
			opacity: {
				set: function(value) {
					return this.domNode.style.opacity = value;
				}
			},
			visible: {
				set: function(value, orig) {
					if (value !== orig) {
						!value && (this._lastDisplay = style.get(this.domNode, "display"));
						style.set(this.domNode, "display", !!value ? this._lastDisplay || "" : "none");
						!!value && this.doLayout();
					}
					return value;
				}
			},
			
			// Properties that are handled by the layout manager
			bottom: undef,
			center: undef,
			height: undef,
			left: undef,
			right: undef,
			top: undef,
			width: undef,
			zIndex: undef
		}

	});

});