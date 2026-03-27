import { DISPOSABLE_DOMAINS } from './disposable-domains';

describe('DISPOSABLE_DOMAINS', () => {
  it('contains the known temporary email providers used by auth validation', () => {
    expect(DISPOSABLE_DOMAINS).toEqual(
      expect.arrayContaining([
        'mailinator.com',
        'yopmail.com',
        'trashmail.com',
      ]),
    );
    expect(new Set(DISPOSABLE_DOMAINS).size).toBe(DISPOSABLE_DOMAINS.length);
  });
});
