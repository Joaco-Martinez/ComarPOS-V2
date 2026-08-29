import { describe, expect, it } from 'vitest';
import {
  appendVaryAccept, markdownRouteFor, notFoundMarkdownBody, preferredType,
} from '../contentNegotiation';

describe('preferredType', () => {
  it('defaults to html when there is no Accept header', () => {
    expect(preferredType(null)).toBe('text/html');
    expect(preferredType(undefined)).toBe('text/html');
  });

  it('picks markdown for an explicit Accept: text/markdown', () => {
    expect(preferredType('text/markdown')).toBe('text/markdown');
  });

  it('honors q-values across candidates', () => {
    expect(preferredType('text/html;q=0.5, text/markdown;q=0.9')).toBe('text/markdown');
    expect(preferredType('text/html;q=0.9, text/markdown;q=0.5')).toBe('text/html');
  });

  it('breaks ties by client order when q-values match', () => {
    expect(preferredType('text/markdown, text/html, */*')).toBe('text/markdown');
    expect(preferredType('text/html, text/markdown, */*')).toBe('text/html');
  });

  it('prefers a specific range over a wildcard regardless of q (RFC 9110 12.5.1)', () => {
    expect(preferredType('text/html;q=0, */*;q=1')).toBe('text/markdown');
  });

  it('falls back to */* when no specific type matches', () => {
    expect(preferredType('*/*')).toBe('text/html');
  });

  it('returns null (406) when the client rejects everything this site produces', () => {
    expect(preferredType('application/pdf')).toBeNull();
    expect(preferredType('text/html;q=0, text/markdown;q=0')).toBeNull();
  });
});

describe('appendVaryAccept', () => {
  it('sets Vary when there is none yet', () => {
    const headers = new Headers();
    appendVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept');
  });

  it('appends Accept to an existing Vary without duplicating it', () => {
    const headers = new Headers({ Vary: 'Accept-Encoding' });
    appendVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept-Encoding, Accept');

    appendVaryAccept(headers);
    expect(headers.get('Vary')).toBe('Accept-Encoding, Accept');
  });

  it('is a no-op when Accept is already present, case-insensitively', () => {
    const headers = new Headers({ Vary: 'accept, Accept-Encoding' });
    appendVaryAccept(headers);
    expect(headers.get('Vary')).toBe('accept, Accept-Encoding');
  });
});

describe('markdownRouteFor', () => {
  it('maps the homepage to the index markdown route', () => {
    expect(markdownRouteFor('/')).toBe('/api/markdown');
  });

  it('maps other negotiated pages to their own markdown route', () => {
    expect(markdownRouteFor('/about')).toBe('/api/markdown/about');
    expect(markdownRouteFor('/contact')).toBe('/api/markdown/contact');
    expect(markdownRouteFor('/privacy')).toBe('/api/markdown/privacy');
  });
});

describe('notFoundMarkdownBody', () => {
  it('starts with a markdown H1', () => {
    expect(notFoundMarkdownBody('/some-path')).toMatch(/^# 404/);
  });

  it('echoes the requested path', () => {
    expect(notFoundMarkdownBody('/some-random-path')).toContain('/some-random-path');
  });

  it('links to the sitemap and llms.txt so an agent can recover', () => {
    const body = notFoundMarkdownBody('/x');
    expect(body).toContain('](https://www.comarpos.com/sitemap.xml)');
    expect(body).toContain('](https://www.comarpos.com/llms.txt)');
    expect(body).toContain('](https://www.comarpos.com/)');
  });
});
