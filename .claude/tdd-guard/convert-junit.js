#!/usr/bin/env node
/**
 * Convert JUnit XML output to tdd-guard JSON format
 */

const fs = require('fs');
const xml2js = require('xml2js');

const [junitFile, outputFile] = process.argv.slice(2);

if (!junitFile || !outputFile) {
  console.error('Usage: node convert-junit.js <junit-file> <output-file>');
  process.exit(1);
}

async function convert() {
  const junitContent = fs.readFileSync(junitFile, 'utf-8');
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(junitContent);

  const testResults = {
    framework: 'bun',
    tests: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    }
  };

  // Handle bun test JUnit format with nested testsuites
  function extractTestCases(element) {
    const cases = [];

    if (element.testcase) {
      cases.push(...element.testcase);
    }

    if (element.testsuite) {
      for (const suite of element.testsuite) {
        cases.push(...extractTestCases(suite));
      }
    }

    return cases;
  }

  const allTestCases = result.testsuites ? extractTestCases(result.testsuites) :
                       result.testsuite ? extractTestCases(result.testsuite) : [];

  for (const tc of allTestCases) {
    const testName = tc.$.name;
    const testFile = tc.$.file || tc.$?.classname || 'unknown';
    const status = tc.failure ? 'failed' : tc.skipped ? 'skipped' : 'passed';

    testResults.tests.push({
      name: testName,
      file: testFile,
      status: status,
      message: tc.failure?.[0]?._ || '',
      stack: tc.failure?.[0]?.$?.['stack-trace'] || ''
    });

    testResults.summary.total++;
    if (status === 'passed') testResults.summary.passed++;
    else if (status === 'failed') testResults.summary.failed++;
    else testResults.summary.skipped++;
  }

  fs.writeFileSync(outputFile, JSON.stringify(testResults, null, 2));
  console.log(`Converted ${testResults.summary.total} tests to tdd-guard format`);
  console.log(`Passed: ${testResults.summary.passed}, Failed: ${testResults.summary.failed}, Skipped: ${testResults.summary.skipped}`);
}

convert().catch(console.error);
