/// <reference path="../../../types/elements.d.ts" />

import { ConfigurableWebComponent, config, Props, PROP_TYPE } from 'wclib';
import { MdCardIDMap, MdCardClassMap } from './md-card-querymap';
import { MDCardHTML } from './md-card.html';
import { MDCardCSS } from './md-card.css';

@config({
	is: 'md-card',
	css: MDCardCSS,
	html: MDCardHTML
})
export class MDCard extends ConfigurableWebComponent<{
	IDS: MdCardIDMap;
	CLASSES: MdCardClassMap;
}> {
	props = Props.define(this, {
		reflect: {
			level: {
				type: PROP_TYPE.NUMBER,
				defaultValue: 1,
				coerce: true
			},
			paddingVertical: {
				type: PROP_TYPE.NUMBER,
				defaultValue: 20,
				coerce: true
			},
			paddingHorizontal: {
				type: PROP_TYPE.NUMBER,
				defaultValue: 20,
				coerce: true
			}
		}
	});
}