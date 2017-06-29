'use strict';

const assert = require('assert');
const path = require('path');
const webpack = require('webpack');
const MemoryFS = require('memory-fs');

const run = require('vm').runInNewContext;

const CommonShakePlugin = require('../').Plugin;

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TMP_DIR = path.join(__dirname, 'tmp');

describe('webpack-common-shake', () => {
  function compile(file, callback) {
    const fs = new MemoryFS();
    const removed = [];
    let globalBailouts = [];
    const moduleBailouts = [];

    const compiler = webpack({
      cache: false,
      bail: true,
      entry: path.join(FIXTURES_DIR, file),
      output: {
        path: TMP_DIR,
        filename: 'out.js'
      },
      plugins: [
        new CommonShakePlugin({
          onExportDelete: (resource, name) => removed.push({ resource, name }),
          onGlobalBailout: (bailouts) => {
            globalBailouts = globalBailouts.concat(bailouts);
          },
          onModuleBailout: (module, bailout) => {
            moduleBailouts.push({ resource: module.resource, bailout });
          }
        })
      ]
    }, (err) => {
      if (err)
        return callback(err);

      const out = fs.readFileSync(path.join(TMP_DIR, 'out.js')).toString();
      callback(null, run(out.toString()), {
        removed,
        globalBailouts,
        moduleBailouts
      });
    });
    compiler.outputFileSystem = fs;
    return compiler;
  }

  it('should compile `root.js`', (cb) => {
    compile('root.js', (err, file) => {
      assert.ok(!err);
      assert.deepEqual(file, { out: 1 });
      cb();
    });
  });

  it('should remove unused exports of `unused-exports.js`', (cb) => {
    compile('unused-exports.js', (err, file, extra) => {
      assert.ok(!err);
      assert.deepEqual(file, { answer: 42 });
      assert.deepEqual(extra.globalBailouts, []);
      assert.deepEqual(extra.moduleBailouts, []);
      assert.deepEqual(extra.removed, [{
        name: 'question',
        resource: path.join(FIXTURES_DIR, 'unused-exports-lib.js')
      }]);
      cb();
    });
  });

  it('should require ESM module', (cb) => {
    compile('require-esm.js', (err, file, extra) => {
      assert.ok(!err);
      assert.deepEqual(file, {
        commonjs: 'rocks',
        commonAnswer: 42,
        esmAnswer: 32
      });
      assert.deepEqual(extra.globalBailouts, []);
      assert.deepEqual(extra.moduleBailouts, [ {
        resource: path.join(FIXTURES_DIR, 'require-esm-esm.js'),
        bailout: [ {
          reason: 'CommonJS module was ESM imported',
          loc: null,
          source: null
        } ]
      } ]);
      assert.deepEqual(extra.removed, []);
      cb();
    });
  });

  it('should not remove anything on global bailout', (cb) => {
    compile('global-bailout.js', (err, file, extra) => {
      assert.ok(!err);
      assert.deepEqual(file, {
        answer: 42
      });
      assert.deepEqual(extra.globalBailouts, [ {
        reason: 'Dynamic argument of `require`',
        loc: {
          start: { line: 5, column: 12 },
          end: { line: 5, column: 60 }
        },
        source: path.join(FIXTURES_DIR, 'global-bailout.js')
      } ]);
      assert.deepEqual(extra.moduleBailouts, []);
      assert.deepEqual(extra.removed, []);
      cb();
    });
  });
});
