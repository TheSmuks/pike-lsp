import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs">
            Get Started
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="https://github.com/TheSmuks/pike-lsp"
          >
            GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

function Feature({ title, description }: { title: string; description: string }) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className="padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

const FeaturesList = [
  {
    title: 'Smart Code Completion',
    description:
      'Intelligent autocomplete with context-aware suggestions for Pike syntax, stdlib modules, and your own code.',
  },
  {
    title: 'Go to Definition',
    description:
      'Navigate to symbol definitions with a single click (F12). Works across files and modules.',
  },
  {
    title: 'Real-time Diagnostics',
    description: 'Instant feedback on syntax errors and potential issues as you type.',
  },
  {
    title: 'Hover Information',
    description: 'Get type information and documentation on hover.',
  },
  {
    title: 'Find References',
    description: 'Find all usages of a symbol across your workspace (Shift+F12).',
  },
  {
    title: 'Roxen Support',
    description:
      'First-class support for Roxen web application framework with RXML tag completion.',
  },
];

function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeaturesList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - ${siteConfig.tagline}`}
      description="Language Server Protocol implementation for Pike programming language"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
