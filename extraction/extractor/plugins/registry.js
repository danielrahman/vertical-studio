const { DefaultExtractorPlugin } = require('./default-plugin');
const { NordicBuildPlugin } = require('./nordicbuild-plugin');

class ExtractorRegistry {
  constructor(options = {}) {
    this.defaultPlugin = options.defaultPlugin || new DefaultExtractorPlugin();
    this.plugins = options.plugins || [new NordicBuildPlugin()];
  }

  resolve(hostname) {
    for (const plugin of this.plugins) {
      try {
        if (typeof plugin.match === 'function' && plugin.match(hostname)) {
          return plugin;
        }
      } catch (_error) {
        // Ignore plugin errors and continue with default plugin.
      }
    }

    return this.defaultPlugin;
  }
}

module.exports = {
  ExtractorRegistry
};
