const fs = require('fs');
const path = require('path');

class InputResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputResolutionError';
    this.statusCode = 400;
  }
}

function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new InputResolutionError(`Input file is unreadable or invalid JSON: ${filePath}`);
  }
}

function applyOptionsToInput(inputObject, options = {}) {
  const output =
    typeof structuredClone === 'function'
      ? structuredClone(inputObject)
      : JSON.parse(JSON.stringify(inputObject));

  if (!output.meta || typeof output.meta !== 'object') {
    output.meta = {};
  }

  if (options.locale) {
    output.meta.locale = options.locale;
  }

  if (options.industry) {
    output.meta.industry = options.industry;
  }

  return output;
}

function findInputByCompanyIdentifier(identifier, samplesDir) {
  const direct = path.join(samplesDir, `${identifier}.json`);
  if (fs.existsSync(direct)) {
    const inputObject = readJsonFile(direct);
    return {
      mode: 'companyIdentifier',
      source: `companyIdentifier:${identifier}`,
      inputPath: direct,
      inputObject
    };
  }

  const sampleFiles = fs
    .readdirSync(samplesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(samplesDir, file));

  for (const filePath of sampleFiles) {
    const inputObject = readJsonFile(filePath);
    const brandSlug = inputObject && inputObject.meta && inputObject.meta.brandSlug;
    if (brandSlug === identifier) {
      return {
        mode: 'companyIdentifier',
        source: `companyIdentifier:${identifier}`,
        inputPath: filePath,
        inputObject
      };
    }
  }

  throw new InputResolutionError(`Unknown companyIdentifier: ${identifier}`);
}

function resolveInputForJob(job, options = {}) {
  const request = job.request || {};
  const samplesDir = options.samplesDir || path.resolve(process.cwd(), 'samples');
  const companiesRepository = options.companiesRepository || null;
  const optionOverrides = job.options || request.options || {};

  if (request.companyIdentifier) {
    if (companiesRepository) {
      const fromCompany =
        companiesRepository.getById(request.companyIdentifier) ||
        companiesRepository.getByBrandSlug(request.companyIdentifier);

      if (fromCompany) {
        if (!fromCompany.normalizedInput || typeof fromCompany.normalizedInput !== 'object') {
          throw new InputResolutionError(
            `Company exists but has no normalized input payload: ${request.companyIdentifier}`
          );
        }

        return {
          mode: 'companyIdentifier',
          source: `company:${fromCompany.id}`,
          inputObject: applyOptionsToInput(fromCompany.normalizedInput, optionOverrides)
        };
      }
    }

    const resolved = findInputByCompanyIdentifier(request.companyIdentifier, samplesDir);
    resolved.inputObject = applyOptionsToInput(resolved.inputObject, optionOverrides);
    return resolved;
  }

  if (request.input && request.input.path) {
    const absolutePath = path.isAbsolute(request.input.path)
      ? request.input.path
      : path.resolve(process.cwd(), request.input.path);

    if (!fs.existsSync(absolutePath)) {
      throw new InputResolutionError(`Input path does not exist: ${request.input.path}`);
    }

    const inputObject = applyOptionsToInput(readJsonFile(absolutePath), optionOverrides);
    return {
      mode: 'input.path',
      source: `input.path:${request.input.path}`,
      inputPath: absolutePath,
      inputObject
    };
  }

  if (request.input && request.input.data && typeof request.input.data === 'object') {
    const inputObject = applyOptionsToInput(request.input.data, optionOverrides);
    return {
      mode: 'input.data',
      source: 'input.data:inline',
      inputObject
    };
  }

  throw new InputResolutionError('No supported input mode found on job payload');
}

module.exports = {
  resolveInputForJob,
  InputResolutionError
};
