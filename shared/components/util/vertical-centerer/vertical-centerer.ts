/// <reference path="../../../types/elements.d.ts" />
import { ConfigurableWebComponent, config, Props, PROP_TYPE } from "../../../lib/webcomponents";
import { VerticalCentererIDMap } from './vertical-centerer-querymap';
import { VerticalCentererHTML } from './vertical-centerer.html';
import { VerticalCentererCSS } from './vertical-centerer.css';

@config({
	is: 'vertical-centerer',
	css: VerticalCentererCSS,
	html: VerticalCentererHTML
})
export class VerticalCenterer extends ConfigurableWebComponent<VerticalCentererIDMap> {
	props = Props.define(this, {
		reflect: {
			fullscreen: PROP_TYPE.BOOL
		}
	});
}