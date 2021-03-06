/// <reference path="../../../types/elements.d.ts" />

import { FloatingActionButtonIDMap, FloatingActionButtonClassMap } from './floating-action-button-querymap';
import { ConfigurableWebComponent, config, Props, PROP_TYPE, isNewElement, bindToClass } from 'wclib';
import { HorizontalCenterer } from '../horizontal-centerer/horizontal-centerer';
import { VerticalCenterer } from '../vertical-centerer/vertical-centerer';
import { FloatingActionButtonHTML } from './floating-action-button.html';
import { FloatingActionButtonCSS } from './floating-action-button.css';
import { rippleEffect, RippleEffect } from '../../../mixins/ripple';

@config({
	is: 'floating-action-button',
	css: FloatingActionButtonCSS,
	html: FloatingActionButtonHTML,
	dependencies: [HorizontalCenterer, VerticalCenterer]
})
@rippleEffect
export class FloatingActionButton extends ConfigurableWebComponent<{
	IDS: FloatingActionButtonIDMap;
	CLASSES: FloatingActionButtonClassMap;
}, {
	click: {
		args: [MouseEvent]
	}
}> {
	props = Props.define(this, {
		reflect: {
			color: PROP_TYPE.STRING,
			backgroundColor: PROP_TYPE.STRING,
			noFloat: {
				type: PROP_TYPE.BOOL,
				value: false
			},
			hide: {
				type: PROP_TYPE.BOOL,
				value: false
			},
			noFadeIn: {
				type: PROP_TYPE.BOOL,
				value: false
			}
		}
	});

	fadeOut() {
		this.props.hide = true;
	}

	fadeIn() {
		this.props.hide = false;
	}

	@bindToClass
	public onClick(e: MouseEvent) {
		this.fire('click', e);
	}

	private rippleElement: HTMLElement|null = null;
	protected get container() {
		return this.$.rippleContainer;
	}
	postRender() {
		if (isNewElement(this.$.rippleContainer)) {
			(() => {
				var rippleContainer = document.createElement('span');
				rippleContainer.classList.add('mdl-button__ripple-container');
				if (this.rippleElement) {
					this.rippleElement.remove();
				}
				this.rippleElement = document.createElement('span');
				this.rippleElement.classList.add('mdl-ripple');
				rippleContainer.appendChild(this.rippleElement);
				this.$.rippleContainer.appendChild(rippleContainer);

				(<any>this as RippleEffect).applyRipple();
			})();
		}
	}
}