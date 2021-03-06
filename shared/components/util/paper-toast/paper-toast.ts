/// <reference path="../../../types/elements.d.ts" />
import { ConfigurableWebComponent, config, Props, PROP_TYPE, createCancellableTimeout, awaitMounted, isNewElement, wait } from 'wclib';
import { PaperToastIDMap, PaperToastClassMap } from './paper-toast-querymap';
import { CheckmarkSize } from '../../icons/checkmark/checkmark';
import { PaperButton } from '../paper-button/paper-button';
import { rippleEffect } from '../../../mixins/ripple';
import { PaperToastHTML } from './paper-toast.html';
import { PaperToastCSS } from './paper-toast.css';
import { html } from 'lit-html';

interface ToastButton {
	content?: string;
	listener: (e: MouseEvent, toast: PaperToast) => void;
}

const TOAST_NAME = 'paper-toast';
@config({
	is: TOAST_NAME,
	css: PaperToastCSS,
	html: PaperToastHTML,
	dependencies: [
		PaperButton
	]
})
@rippleEffect
export class PaperToast extends ConfigurableWebComponent<{
	IDS: PaperToastIDMap;
	CLASSES: PaperToastClassMap;
}, {
	buttonClick: {
		args: [number, MouseEvent]
	};
	hide: {
		args: []
	}
}> {
	props = Props.define(this, {
		reflect: {
			content: {
				type: PROP_TYPE.STRING,
				defaultValue: ''
			},
			button1: PROP_TYPE.STRING,
			button2: PROP_TYPE.STRING,
			duration: {
				type: PROP_TYPE.NUMBER,
				defaultValue: 5000,
				coerce: true
			}
		}	
	});

	private static _showListeners: ((type: 'show'|'hide') => void)[] = [];
	static listen(listener: (type: 'show'|'hide') => void) {
		this._showListeners.push(listener);
	}

	show() {
		PaperToast._showListeners.forEach(listener => listener('show'));

		this.classList.add('show');
		if (this.props.duration === Infinity) {
			return;
		}
		createCancellableTimeout(this, 'show', () => {
			this.hide();
		}, this.props.duration);
	}

	async hide() {
		PaperToast._showListeners.forEach(listener => listener('hide'));

		this.classList.remove('show');
		this.fire('hide');
		await wait(300);
		this.remove();
	}

	async postRender() {
		const buttons = this.$.toastButtons;
		if (buttons) {
			const [ button1, button2 ] = <PaperButton[]><any>buttons.children;
			if (this.props.button1 && isNewElement(button1)) {
				await awaitMounted(button1);
				button1.listen('click', (e) => {
					this.fire('buttonClick', 0, e);
				});
			}
			if (this.props.button2 && isNewElement(button2)) {
				await awaitMounted(button2);
				button2.listen('click', (e) => {
					this.fire('buttonClick', 1, e);
				});
			}
		}
	}

	private static _queue: PaperToast[] = [];
	private static _createElement({
		content, buttons = [], duration = 5000
	}: {
		content: string;
		buttons?: ToastButton[];
		duration?: number;
	}) {
		const el = document.createElement(TOAST_NAME) as PaperToast;
		el.props.content = content;
		if (buttons[0] && buttons[0].content) {
			el.props.button1 = buttons[0].content;
		}
		if (buttons[1] && buttons[1].content) {
			el.props.button1 = buttons[1].content;
		}
		el.listen('buttonClick', (index, e) => {
			buttons[index].listener(e, el);
		});
		el.props.duration = duration;
		return el;
	}
	
	private static _queueElement(el: PaperToast) {
		if (!el) {
			return;
		}

		setTimeout(() => {
			el.show();
			el.listen('hide', () => {
				this._queue.shift();
				this._queueElement(this._queue[0]);
			});
		}, 0);
	}

	static BUTTONS = {
		HIDE: {
			content: 'HIDE',
			listener(_e, toast) {
				toast.hide();
			}
		} as ToastButton
	}
	static DURATION = {
		SHORT: 2500,
		NORMAL: 5000,
		LONG: 10000,
		FOREVER: 1000 * 60 * 60 * 24
	}

	static createHidable(content: string, duration: number = this.DURATION.SHORT) {
		return this.create({
			content,
			duration,
			buttons: [this.BUTTONS.HIDE]
		});
	}

	static createConfirmationDialog(contents: string|{
		question: string;
		confirm?: string;
		cancel?: string;
	}, maxDuration: number = this.DURATION.FOREVER, defaultAction: boolean = false): Promise<boolean> {
		const { 
			question,
			cancel = 'No', 
			confirm = 'Yes'
		} = typeof contents === 'string' ? {
			question: contents
		} : contents;

		return new Promise<boolean>((resolve) => {
			this.create({
				content: question,
				buttons: [{
					content: confirm,
					listener() {
						resolve(true);
					}
				}, {
					content: cancel,
					listener() {
						resolve(false);
					}
				}],
				duration: maxDuration
			}).listen('hide', () => resolve(defaultAction));
		});
	}

	private static _attachLoadingListeners(texts: {
		loading: string;
		success: string;
		failure: string;
	}, toast: PaperToast, promise: Promise<any>, first: boolean, retryCallback?: () => Promise<any>) {
		if (!first) {
			toast.props.content = <string><any>(html`${texts.loading}<loading-spinner class="inlineIcon" dimensions="30"></loading-spinner>`);
		}

		promise.then(async () => {
			toast.props.content = <string><any>(html`${texts.success}<span class="inlineIcon checkmark">${CheckmarkSize(30)}</span>`);
			await wait(2500);
		}).catch(async () => {
			toast.props.content = <string><any>(html`${texts.failure}`);
			if (retryCallback) {
				toast.props.button1 = 'RETRY';
				toast.listen('buttonClick', (index) => {
					if (index === 0) {
						toast.props.button1 = null as any;
						this._attachLoadingListeners(texts, toast, retryCallback(),
							false, retryCallback);
					}
				}, true);
				await wait(10000);
			} else {
				await wait(5000);
			}
		});
	}
	
	static createLoading(texts: {
		loading: string;
		success: string;
		failure: string;
	}, promise: Promise<any>, retryCallback?: () => Promise<any>) {
		const toast = this.create({
			content: <string><any>(html`${texts.loading}<loading-spinner class="inlineIcon" dimensions="30"></loading-spinner>`),
			duration: Infinity,
			buttons: [{listener: () => {}}]
		});
		this._attachLoadingListeners(texts, toast, promise, true, retryCallback);
		return toast;
	}

	static create(config: {
		content: string;
		buttons?: ToastButton[];
		duration?: number;
	}): PaperToast {
		const el = this._createElement(config);
		document.body.appendChild(el);

		this._queue.push(el);
		if (this._queue.length === 1) {
			this._queueElement(el);
		}
		return el;
	}

	static hideAll() {
		if (!this._queue.length) return;

		const first = this._queue[0];
		while (this._queue.length) { this._queue.pop()!.hide(); }

		first.hide();
	}
}