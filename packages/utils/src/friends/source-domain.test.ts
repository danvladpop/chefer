import { describe, expect, it } from 'vitest';
import { sourceDomainOf } from './source-domain';

describe('sourceDomainOf', () => {
  it('returns the hostname without www.', () => {
    expect(sourceDomainOf('https://www.bbcgoodfood.com/recipes/x')).toBe('bbcgoodfood.com');
    expect(sourceDomainOf('http://smittenkitchen.com')).toBe('smittenkitchen.com');
    expect(sourceDomainOf('HTTPS://WWW.Jamie.Oliver.COM/a?b=c#d')).toBe('jamie.oliver.com');
    expect(sourceDomainOf('https://cooking.nytimes.com/recipes/1')).toBe('cooking.nytimes.com');
    expect(sourceDomainOf('  https://example.com:8080/x ')).toBe('example.com');
    expect(sourceDomainOf('https://example.com./x')).toBe('example.com');
  });

  it('uses the real host when credentials are smuggled in front', () => {
    expect(sourceDomainOf('https://bbcgoodfood.com@evil.example/x')).toBe('evil.example');
    expect(sourceDomainOf('https://user:pw@www.site.org/x')).toBe('site.org');
  });

  it('returns null for invalid or non-http(s) URLs', () => {
    expect(sourceDomainOf('javascript:alert(1)')).toBeNull();
    expect(sourceDomainOf('data:text/html,<script>')).toBeNull();
    expect(sourceDomainOf('ftp://files.example.com/x')).toBeNull();
    expect(sourceDomainOf('file:///etc/passwd')).toBeNull();
    expect(sourceDomainOf('//example.com/x')).toBeNull();
    expect(sourceDomainOf('example.com')).toBeNull();
    expect(sourceDomainOf('https://')).toBeNull();
    expect(sourceDomainOf('https:///x')).toBeNull();
    expect(sourceDomainOf('https://exa mple.com')).toBeNull();
    expect(sourceDomainOf('https://[::1]/x')).toBeNull();
    expect(sourceDomainOf('https://-bad-.com')).toBeNull();
    expect(sourceDomainOf('https://www.')).toBeNull();
    expect(sourceDomainOf('')).toBeNull();
    expect(sourceDomainOf(null)).toBeNull();
    expect(sourceDomainOf(undefined)).toBeNull();
  });
});
