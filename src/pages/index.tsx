import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

export default function Home(): React.JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Language Server for Pike`}
      description="A comprehensive Language Server Protocol implementation for the Pike programming language">
      <main>
        <div style={{padding: '4rem 2rem', textAlign: 'center'}}>
          <Heading as="h1" style={{fontSize: '3rem', marginBottom: '1rem'}}>
            {siteConfig.title}
          </Heading>
          <p style={{fontSize: '1.5rem', color: 'var(--ifm-color-emphasis-700)'}}>
            {siteConfig.tagline}
          </p>
          <div style={{marginTop: '2rem'}}>
            <Link
              className="button button--primary button--lg"
              to="/docs"
              style={{marginRight: '1rem'}}>
              Get Started
            </Link>
            <Link
              className="button button--secondary button--lg"
              to="/docs/features">
              View Features
            </Link>
          </div>
        </div>

        <div style={{padding: '2rem', backgroundColor: 'var(--ifm-background-surface-color)'}}>
          <div style={{maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem'}}>
            <div style={{padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)'}}>
              <Heading as="h3">Core Features</Heading>
              <p>Syntax highlighting, code completion, go to definition, find references, hover information, and more.</p>
              <Link to="/docs/features">Learn more →</Link>
            </div>
            <div style={{padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)'}}>
              <Heading as="h3">Roxen Support</Heading>
              <p>Comprehensive LSP support for Roxen WebServer framework including defvar extraction and RXML tag detection.</p>
              <Link to="/docs/features">Learn more →</Link>
            </div>
            <div style={{padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--ifm-color-emphasis-200)'}}>
              <Heading as="h3">Performance</Heading>
              <p>Parses 1000+ line files in ~15ms with smart caching and batch parsing for fast workspace indexing.</p>
              <Link to="/docs/features">Learn more →</Link>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
