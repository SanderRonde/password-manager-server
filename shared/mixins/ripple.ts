import { ConfiguredComponent } from '../lib/webcomponents/configurable';
import { ProjectTheme } from '../components/theming/theme/theme.es';
import { listenWithIdentifier } from '../lib/webcomponent-util';
import { TemplateFn, CHANGE_TYPE } from '../lib/webcomponents';
import { ExtendableComponent } from '../lib/decorators';

export const RippleCSS = new TemplateFn<any, ProjectTheme>((html, _props, theme) => {
	return html`<style>
		.mdl-button--raised.mdl-button--colored .mdl-ripple {
			background: ${theme.textOnNonbackground};
		}

		.mdl-button--fab .mdl-button__ripple-container {
			border-radius: 50%;
			-webkit-mask-image: -webkit-radial-gradient(circle, white, black);
			mask-image: radial-gradient(circle, white, black);
		}

		.mdl-button--fab.mdl-button--colored .mdl-ripple {
			background: ${theme.textOnNonbackground};
		}

		.mdl-button--icon .mdl-button__ripple-container {
			border-radius: 50%;
			-webkit-mask-image: -webkit-radial-gradient(circle, white, black);
			mask-image: radial-gradient(circle, white, black);
		}

		.mdl-button__ripple-container {
			display: block;
			height: 100%;
			left: 0px;
			position: absolute;
			top: 0px;
			width: 100%;
			z-index: 0;
			overflow: hidden;
		}
		.mdl-button[disabled] .mdl-button__ripple-container .mdl-ripple, .mdl-button.mdl-button--disabled .mdl-button__ripple-container .mdl-ripple {
			background-color: transparent;
		}

		.mdl-button--primary.mdl-button--primary .mdl-ripple {
			background: ${theme.textOnNonbackground};
		}

		.mdl-button--accent.mdl-button--accent .mdl-ripple {
			background: ${theme.textOnNonbackground};
		}

		.mdl-ripple {
			border-radius: 50%;
			height: 50px;
			left: 0;
			opacity: 0;
			pointer-events: none;
			position: absolute;
			top: 0;
			transform: translate(-50%, -50%);
			width: 50px;
			overflow: hidden;
			background-color: ${theme.textOnNonbackground};
		}
		.mdl-ripple.is-animating {
			transition: transform 0.3s cubic-bezier(0, 0, 0.2, 1), 
				width 0.3s cubic-bezier(0, 0, 0.2, 1), 
				height 0.3s cubic-bezier(0, 0, 0.2, 1), 
				opacity 0.6s cubic-bezier(0, 0, 0.2, 1);
		}
		.mdl-ripple.is-visible {
			opacity: 0.3;
		}
	</style>`
}, CHANGE_TYPE.THEME);

export interface RippleEffect {
	applyRipple(): void;
}
//A lot of functions on this class are based on those in
// https://github.com/google/material-design-lite/tree/mdl-1.x/src/ripple
// so credit goes to the original authors
export function rippleEffect(target: ExtendableComponent): any {
	return class Rippled extends target implements RippleEffect {
		protected css!: TemplateFn;
		protected __hasCustomCSS!: () => boolean;
		protected customCSS!: () => TemplateFn;
		protected html!: TemplateFn;
		protected get self(): typeof ConfiguredComponent { return {} as any}
		private _rippleElement!: HTMLElement|null;
		private _rippleSize!: number;
		private _ignoringMouseDown!: boolean;
		private _frameCount!: number;
		private _x!: number;
		private _y!: number;
		
		protected container!: HTMLElement;

		constructor() {
			super();
		}

		private _downHandler(event: MouseEvent) {
			if (!this._rippleElement!.style.width && !this._rippleElement!.style.height) {
				var rect = this.container.getBoundingClientRect();
				this._rippleSize = Math.sqrt(rect.width * rect.width +
					rect.height * rect.height) * 2 + 2;
				this._rippleElement!.style.width = this._rippleSize + 'px';
				this._rippleElement!.style.height = this._rippleSize + 'px';
				}

				this._rippleElement!.classList.add('is-visible');

				if (event.type === 'mousedown' && this._ignoringMouseDown) {
					this._ignoringMouseDown = false;
				} else {
				if (event.type === 'touchstart') {
					this._ignoringMouseDown = true;
				}
				var frameCount = this._getFrameCount();
				if (frameCount > 0) {
					return;
				}
				this._setFrameCount(1);
				var bound = (event.currentTarget! as HTMLElement).getBoundingClientRect();
				var x;
				var y;
				// Check if we are handling a keyboard click.
				if (event.clientX === 0 && event.clientY === 0) {
					x = Math.round(bound.width / 2);
					y = Math.round(bound.height / 2);
				} else {
					var clientX = event.clientX !== undefined ? event.clientX : (event as any).touches[0].clientX;
					var clientY = event.clientY !== undefined ? event.clientY : (event as any).touches[0].clientY;
					x = Math.round(clientX - bound.left);
					y = Math.round(clientY - bound.top);
				}
				this._setRippleXY(x, y);
				this._setRippleStyles(true);
				window.requestAnimationFrame(this._animFrameHandler.bind(this));
			}
		}

		private _upHandler(event: MouseEvent) {
			// Don't fire for the artificial "mouseup" generated by a double-click.
			if (event && event.detail !== 2) {
				// Allow a repaint to occur before removing this class, so the animation
				// shows for tap events, which seem to trigger a mouseup too soon after
				// mousedown.
				window.setTimeout(() => {
					this._rippleElement!.classList.remove('is-visible');
				}, 0);
			}
		};

		private _getFrameCount() {
			return this._frameCount;
		};

		private _setFrameCount(frameCount: number) {
			this._frameCount = frameCount;
		};

		private _setRippleXY(newX: number, newY: number) {
			this._x = newX;
			this._y = newY;
		};

		/**
		 * Sets the ripple styles.
		 * @param  {boolean} start whether or not this is the start frame.
		 */
		private _setRippleStyles(start: boolean) {
			if (this._rippleElement! !== null) {
				var transformString;
				var scale;
				var offset = 'translate(' + this._x + 'px, ' + this._y + 'px)';

				if (start) {
					scale = 'scale(0.0001, 0.0001)';
				} else {
					scale = '';
				}

				transformString = 'translate(-50%, -50%) ' + offset + scale;

				this._rippleElement!.style.webkitTransform = transformString;
				this._rippleElement!.style.transform = transformString;

				if (start) {
					this._rippleElement!.classList.remove('is-animating');
				} else {
					this._rippleElement!.classList.add('is-animating');
				}
			}
		};

		/**
		 * Handles an animation frame.
		 */
		private _animFrameHandler() {
			if (this._frameCount-- > 0) {
			window.requestAnimationFrame(this._animFrameHandler.bind(this));
			} else {
			this._setRippleStyles(false);
			}
		};

		applyRipple() {
			if (!this.container.classList.contains('mdl-js-ripple-effect--ignore-events')) {
				this._rippleElement = this.container.querySelector('.mdl-ripple');
				this._frameCount = 0;
				this._rippleSize = 0;
				this._x = 0;
				this._y = 0;
		
				// Touch start produces a compat mouse down event, which would cause a
				// second ripples. To avoid that, we use this property to ignore the first
				// mouse down after a touch start.
				this._ignoringMouseDown = false;
		
				listenWithIdentifier(this as any, this.container, 'container',
					'mousedown', this._downHandler.bind(this));
				listenWithIdentifier(this as any, this.container, 'container',
					'touchstart', this._downHandler.bind(this), {
						passive: true
					});
		
				listenWithIdentifier(this as any, this.container, 'container', 
					'mouseup', this._upHandler.bind(this));
				listenWithIdentifier(this as any, this.container, 'container', 
					'mouseleave', this._upHandler.bind(this));
				listenWithIdentifier(this as any, this.container, 'container', 
					'touchend', this._upHandler.bind(this));
				listenWithIdentifier(this as any, this.container, 'container', 
					'blur', this._upHandler.bind(this));
			}
		}
	}
}