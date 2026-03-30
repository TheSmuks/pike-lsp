import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { CompletionItemKind } from 'vscode-languageserver/node.js';
import { getRequestIDCompletions } from '../../../features/roxen/completions/request-id.js';

describe('Roxen RequestID Completions', () => {
  describe('getRequestIDCompletions()', () => {
    it('should return an array', () => {
      const completions = getRequestIDCompletions();
      assert.ok(Array.isArray(completions), 'should return an array');
    });

    it('should return non-empty array with expected members', () => {
      const completions = getRequestIDCompletions();
      assert.ok(completions.length > 0, 'should return non-empty array');

      const labels = completions.map(c => c.label);

      assert.ok(labels.includes('conf'), 'should include conf');
      assert.ok(labels.includes('variables'), 'should include variables');
      assert.ok(labels.includes('real_variables'), 'should include real_variables');
      assert.ok(labels.includes('not_query'), 'should include not_query');
      assert.ok(labels.includes('query'), 'should include query');
      assert.ok(labels.includes('raw_url'), 'should include raw_url');
      assert.ok(labels.includes('request_headers'), 'should include request_headers');
      assert.ok(labels.includes('response_headers'), 'should include response_headers');
      assert.ok(labels.includes('misc'), 'should include misc');
      assert.ok(labels.includes('user'), 'should include user');
      assert.ok(labels.includes('cookies'), 'should include cookies');
      assert.ok(labels.includes('remoteaddr'), 'should include remoteaddr');
      assert.ok(labels.includes('supports'), 'should include supports');
      assert.ok(labels.includes('client_var'), 'should include client_var');
      assert.ok(labels.includes('time'), 'should include time');
      assert.ok(labels.includes('method'), 'should include method');
      assert.ok(labels.includes('protocol'), 'should include protocol');
      assert.ok(labels.includes('body'), 'should include body');
    });

    it('should include expected methods', () => {
      const completions = getRequestIDCompletions();
      const labels = completions.map(c => c.label);

      assert.ok(labels.includes('set_max_cache()'), 'should include set_max_cache()');
      assert.ok(labels.includes('lower_max_cache()'), 'should include lower_max_cache()');
      assert.ok(labels.includes('raise_max_cache()'), 'should include raise_max_cache()');
      assert.ok(labels.includes('url_base()'), 'should include url_base()');
    });

    it('should have valid completion item structure', () => {
      const completions = getRequestIDCompletions();

      for (const completion of completions) {
        assert.ok(completion.label, 'should have label');
        assert.ok(typeof completion.label === 'string', 'label should be string');
        assert.ok(completion.kind !== undefined, 'should have kind');
        assert.ok(completion.detail !== undefined, 'should have detail');
        assert.ok(typeof completion.detail === 'string', 'detail should be string');
      }
    });

    it('should have correct kind for properties', () => {
      const completions = getRequestIDCompletions();

      const propertyLabels = [
        'conf',
        'variables',
        'real_variables',
        'not_query',
        'query',
        'raw_url',
        'request_headers',
        'response_headers',
        'misc',
        'user',
        'prestate',
        'cookies',
        'remoteaddr',
        'supports',
        'client_var',
        'time',
        'method',
        'protocol',
        'body',
      ];

      for (const label of propertyLabels) {
        const completion = completions.find(c => c.label === label);
        assert.ok(completion, `should find completion for ${label}`);
        assert.equal(
          completion.kind,
          CompletionItemKind.Property,
          `${label} should be Property kind`
        );
      }
    });

    it('should have correct kind for methods', () => {
      const completions = getRequestIDCompletions();

      const methodLabels = [
        'set_max_cache()',
        'lower_max_cache()',
        'raise_max_cache()',
        'url_base()',
      ];

      for (const label of methodLabels) {
        const completion = completions.find(c => c.label === label);
        assert.ok(completion, `should find completion for ${label}`);
        assert.equal(completion.kind, CompletionItemKind.Method, `${label} should be Method kind`);
      }
    });

    it('should have documentation for all completions', () => {
      const completions = getRequestIDCompletions();

      for (const completion of completions) {
        assert.ok(
          completion.documentation !== undefined,
          `${completion.label} should have documentation`
        );
      }
    });

    it('should filter completions by prefix', () => {
      const completions = getRequestIDCompletions();

      const filtered = completions.filter(c => c.label.startsWith('set'));
      assert.ok(filtered.length > 0, 'should find completions starting with set');
      assert.ok(
        filtered.every(c => c.label.startsWith('set')),
        'all filtered should start with set'
      );
    });

    it('should filter completions by query prefix', () => {
      const completions = getRequestIDCompletions();

      const filtered = completions.filter(c => c.label.startsWith('query'));
      assert.equal(filtered.length, 1, 'should find 1 completion starting with query');
      assert.equal(filtered[0].label, 'query', 'should be query');
    });

    it('should handle case-sensitive filtering', () => {
      const completions = getRequestIDCompletions();

      const upperCase = completions.filter(c => c.label.startsWith('CONF'));
      assert.equal(upperCase.length, 0, 'should not find uppercase CONF');

      const lowerCase = completions.filter(c => c.label.startsWith('conf'));
      assert.ok(lowerCase.length > 0, 'should find lowercase conf');
    });
  });
});
