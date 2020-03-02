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

import * as bent from 'bent';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { VSXExtensionRaw, VSXSearchParam, VSXSearchResult } from './vsx-registry-types';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';

const fetchText = bent('GET', 'string', 200);
const fetchJson = bent('GET', 'json', 200);

export interface VSXResponseError extends Error {
    statusCode: number
}
export namespace VSXResponseError {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(error: any): error is VSXResponseError {
        return !!error && typeof error === 'object'
            && 'statusCode' in error && typeof error['statusCode'] === 'number';
    }
}

@injectable()
export class VSXRegistryAPI {

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    protected _extensionsDirUri: URI | undefined;
    async getExtensionsDirUri(): Promise<URI> {
        if (!this._extensionsDirUri) {
            const configDir = new URI(await this.envServer.getConfigDirUri());
            this._extensionsDirUri = configDir.resolve('extensions');
        }
        return this._extensionsDirUri;
    }

    protected _apiUri: URI | undefined;
    protected async getApiUri(): Promise<URI> {
        if (!this._apiUri) {
            const vsxRegistryUrl = await this.envServer.getValue('VSX_REGISTRY_URL');
            this._apiUri = new URI(vsxRegistryUrl && vsxRegistryUrl.value || 'https://open-vsx.org').resolve('api');
        }
        return this._apiUri;
    }

    async search(param?: VSXSearchParam): Promise<VSXSearchResult> {
        const apiUri = await this.getApiUri();
        let searchUri = apiUri.resolve('-/search');
        if (param) {
            let query = '';
            if (param.query) {
                query += 'query=' + param.query;
            }
            if (param.category) {
                query += 'category=' + param.category;
            }
            if (param.size) {
                query += 'size=' + param.size;
            }
            if (param.offset) {
                query += 'offset=' + param.offset;
            }
            if (query) {
                searchUri = searchUri.withQuery(query);
            }
        }
        return this.fetchJson<VSXSearchResult>(searchUri.toString());
    }

    async getExtension(id: string): Promise<VSXExtensionRaw> {
        const apiUri = await this.getApiUri();
        return this.fetchJson(apiUri.resolve(id.replace('.', '/')).toString());
    }

    protected async fetchJson<T>(url: string): Promise<T> {
        const result = await fetchJson(url);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return result as any as T;
    }

    fetchText(url: string): Promise<string> {
        return fetchText(url);
    }

}
