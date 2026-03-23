import { getRequestConfig } from 'next-intl/server';


// Can be imported from a shared config
const locales = ['en', 'es'] as const;

function isSupportedLocale(locale: string): locale is (typeof locales)[number] {
    return locales.includes(locale as (typeof locales)[number]);
}

export default getRequestConfig(async ({ requestLocale }) => {
    // This typically corresponds to the `[locale]` segment
    let locale = await requestLocale;

    // Ensure that a valid locale is used
    if (!locale || !isSupportedLocale(locale)) {
        locale = 'es'; // Default locale
    }

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default
    };
});
