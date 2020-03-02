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

import { injectable, inject, postConstruct } from 'inversify';
import * as showdown from 'showdown';
import * as sanitize from 'sanitize-html';
import { Emitter } from '@theia/core/lib/common/event';
import { VSXRegistryAPI, VSXResponseError } from '../common/vsx-registry-api';
import { VSXSearchParam } from '../common/vsx-registry-types';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { VSXExtension, VSXExtensionFactory } from './vsx-extension';
import { ProgressService } from '@theia/core/lib/common/progress-service';

@injectable()
export class VSXExtensionService {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    @inject(VSXRegistryAPI)
    protected readonly api: VSXRegistryAPI;

    @inject(HostedPluginSupport)
    protected readonly pluginSupport: HostedPluginSupport;

    @inject(VSXExtensionFactory)
    protected readonly extensionFactory: VSXExtensionFactory;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    @postConstruct()
    protected init(): void {
        this.update();
        this.pluginSupport.onDidChangePlugins(() => this.update());
    }

    /**
     * single source of all extensions
     */
    protected readonly extensions = new Map<string, VSXExtension>();

    protected _installed = new Set<string>();
    get installed(): IterableIterator<string> {
        return this._installed.values();
    }

    protected _searchResult = new Set<string>();
    get searchResult(): IterableIterator<string> {
        return this._searchResult.values();
    }

    getExtension(id: string): VSXExtension | undefined {
        return this.extensions.get(id);
    }

    protected setExtension(id: string): VSXExtension {
        let extension = this.extensions.get(id);
        if (!extension) {
            extension = this.extensionFactory({ id });
            this.extensions.set(id, extension);
        }
        return extension;
    }

    protected doChange<T>(task: () => Promise<T>): Promise<T> {
        return this.progressService.withProgress('', 'extensions', async () => {
            const result = await task();
            this.onDidChangeEmitter.fire(undefined);
            return result;
        });
    }

    // TODO: cancellation support
    find(param?: VSXSearchParam): Promise<void> {
        return this.doChange(async () => {
            const result = await this.api.search(param);
            const searchResult = new Set<string>();
            for (const data of result.extensions) {
                const id = data.publisher.toLowerCase() + '.' + data.name.toLowerCase();
                this.setExtension(id).update(data);
                searchResult.add(id);
            }
            this._searchResult = searchResult;
        });
    }

    // TODO p-debounce
    async update(): Promise<void> {
        return this.doChange(async () => {
            const plugins = this.pluginSupport.plugins;
            const installed = new Set<string>();
            const refreshing = [];
            for (const plugin of plugins) {
                if (plugin.model.engine.type === 'vscode') {
                    const id = plugin.model.id;
                    this._installed.delete(id);
                    const extension = this.setExtension(id);
                    installed.add(extension.id);
                    refreshing.push(this.refresh(id));
                }
            }
            for (const id of this._installed) {
                refreshing.push(this.refresh(id));
            }
            Promise.all(refreshing);
            this._installed = installed;
        });
    }

    resolve(id: string): Promise<VSXExtension> {
        return this.doChange(async () => {
            const extension = await this.refresh(id);
            if (!extension) {
                throw new Error(`Failed to resolve ${id} extension.`);
            }
            if (extension.readmeUrl) {
                try {
                    const rawReadme = await this.api.fetchText(extension.readmeUrl);
                    const readme = this.compileReadme(rawReadme);
                    extension.update({ readme });
                } catch (e) {
                    if (!VSXResponseError.is(e) || e.statusCode !== 404) {
                        console.error(`[${id}]: failed to compile readme, reason:`, e);
                    }
                }
            }
            return extension;
        });
    }

    protected compileReadme(readmeMarkdown: string): string {
        const markdownConverter = new showdown.Converter({
            noHeaderId: true,
            strikethrough: true,
            headerLevelStart: 2
        });

        const readmeHtml = markdownConverter.makeHtml(readmeMarkdown);
        return sanitize(readmeHtml, {
            allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'img'])
        });
    }

    protected async refresh(id: string): Promise<VSXExtension | undefined> {
        try {
            const data = await this.api.getExtension(id);
            const extension = this.setExtension(id);
            extension.update(data);
            return extension;
        } catch (e) {
            if (VSXResponseError.is(e) && e.statusCode === 404) {
                const extension = this.getExtension(id);
                if (extension && extension.installed) {
                    return extension;
                }
            } else {
                console.error(`[${id}]: failed to refresh, reason:`, e);
            }
            return undefined;
        }
    }

}
