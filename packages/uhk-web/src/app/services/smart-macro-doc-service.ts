import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Action, Store } from '@ngrx/store';
import { CommandMacroAction, LogService } from 'uhk-common';
import { Subject, Subscription } from 'rxjs';

import { AppState, getSelectedMacroAction, getSmartMacroDocModuleIds } from '../store';
import { OpenUrlInNewWindowAction } from '../store/actions/app';
import { SmdInitedAction } from '../store/actions/smart-macro-doc.action';
import { SelectedMacroAction, SelectedMacroActionId, TabName } from '../models';

export enum SmartMacroDocCommandAction {
    insert,
    set
}

export interface SmartMacroDocCommand {
    action: SmartMacroDocCommandAction;
    data: string;
    macroActionId: SelectedMacroActionId;
}

@Injectable()
export class SmartMacroDocService implements OnDestroy {
    smartMacroDocCommand = new Subject<SmartMacroDocCommand>();
    selectedMacroAction: SelectedMacroAction;
    smartMacroDocModuleIds: Array<number> = [];

    private subscriptions = new Subscription();
    private iframe: HTMLIFrameElement;

    constructor(private store: Store<AppState>,
                private logService: LogService,
                private zone: NgZone) {
        window.addEventListener('message', this.onMessage.bind(this));
        window.addEventListener('messageerror', this.onMessageError.bind(this));

        this.subscriptions.add(
            store.select(getSelectedMacroAction)
                .subscribe(action => {
                    this.selectedMacroAction = action;
                    this.dispatchMacroEditorFocusEvent();
                })
        );

        this.subscriptions.add(
            store.select(getSmartMacroDocModuleIds)
                .subscribe(moduleIds => {
                    this.smartMacroDocModuleIds = moduleIds;
                    this.dispatchMacroEditorFocusEvent();
                })
        );
    }

    ngOnDestroy(): void {
        window.removeEventListener('message', this.onMessage.bind(this));
        window.removeEventListener('messageerror', this.onMessageError.bind(this));
        this.subscriptions.unsubscribe();
    }

    setIframe(iframe: HTMLIFrameElement): void {
        this.iframe = iframe;
        this.dispatchMacroEditorFocusEvent();
    }

    updateCommand(command: string): void {
        this.dispatchMacroEditorFocusEvent(command);
    }

    /**
     * Send message to the Smart Macro Doc.
     * If the smart macro has not been initialised then the message will be dropped
     */
    sendMessage(message: any): void {
        if (!this.iframe?.contentWindow) {
            return;
        }

        this.iframe.contentWindow.postMessage(message, '*');
    }

    private dispatchStoreAction(action: Action) {
        this.logService.misc(`[SmartMacroDocService] dispatch action: ${action.type}`);
        this.zone.run(() => this.store.dispatch(action));
    }

    private onMessageError(event: MessageEvent): void {
        console.error(event);
    }

    private onMessage(event: MessageEvent): void {
        switch (event.data.action) {
            case 'doc-message-inited': {
                this.dispatchMacroEditorFocusEvent();

                return this.dispatchStoreAction(new SmdInitedAction());
            }

            case 'doc-message-insert-macro':
                return this.dispatchSmartMacroDocCommand(SmartMacroDocCommandAction.insert, event.data.command);

            case 'doc-message-set-macro':
                return this.dispatchSmartMacroDocCommand(SmartMacroDocCommandAction.set, event.data.command);

            case 'doc-message-open-link': {
                return this.dispatchStoreAction(new OpenUrlInNewWindowAction(event.data.url));
            }

            default: {
                break;
            }
        }
    }

    private dispatchSmartMacroDocCommand(action: SmartMacroDocCommandAction, data: any): void {
        if (!this.selectedMacroAction) {
            return;
        }

        this.smartMacroDocCommand.next({
            action,
            data,
            macroActionId: this.selectedMacroAction.id
        });
    }

    private dispatchMacroEditorFocusEvent(command = ''): void {
        const message = {
            action: 'agent-message-editor-lost-focus',
            command: ''
        };

        if (command) {
            message.action = 'agent-message-editor-got-focus';
            message.command = command;
        }
        // it should be the 2nd condition otherwise the unchanged command will dispatch
        else if (this.selectedMacroAction?.type === TabName.Command) {
            message.action = 'agent-message-editor-got-focus';
            message.command = (this.selectedMacroAction.macroAction as CommandMacroAction).command;
        } else if (this.selectedMacroAction?.id === 'new') {
            message.action = 'agent-message-editor-got-focus';
            message.command = '';
        }

        this.sendMessage(message);
    }
}
