import catalogJson from './models.json' with { type: 'json' };
import { createCatalog } from '@neotools/models';

const api = createCatalog(catalogJson);

export const MODEL_REGISTRY = api.MODEL_REGISTRY;
export const listModels = api.listModels;
export const getModel = api.getModel;
export const modelsForTool = api.modelsForTool;
export const modelConfirmMessage = api.modelConfirmMessage;
export const forbiddenLicense = api.forbiddenLicense;
