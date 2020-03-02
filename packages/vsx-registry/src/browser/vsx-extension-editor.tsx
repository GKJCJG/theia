/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as React from 'react';
import { inject, injectable, postConstruct } from 'inversify';
import { ReactWidget, Message } from '@theia/core/lib/browser';
import { VSXExtension } from './vsx-extension';
import { VSXExtensionService } from './vsx-extensions-service';

@injectable()
export class VSXExtensionEditor extends ReactWidget {

    static ID = 'vsx-extension-editor';

    @inject(VSXExtension)
    protected readonly extension: VSXExtension;

    @inject(VSXExtensionService)
    protected readonly service: VSXExtensionService;

    @postConstruct()
    protected init(): void {
        this.addClass('theia-vsx-extension-editor');
        this.id = VSXExtensionEditor.ID + ':' + this.extension.id;
        this.title.closable = true;
        this.updateTitle();
        // TODO: use extension icon when possible otherwise align with VS Code
        this.title.iconClass = 'fa fa-puzzle-piece';

        this.update();
        this.toDispose.push(this.service.onDidChange(() => this.update()));
    }

    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        this.updateTitle();
    }

    protected updateTitle(): void {
        const label = 'Extension: ' + (this.extension.displayName || this.extension.name);
        this.title.label = label;
        this.title.caption = label;
    }

    protected render(): React.ReactNode {
        return this.extension.renderEditor();
    }

}
