import { fetchAndroidCatalog } from '@/lib/android-releases';

/**
 * Stable install link: https://moneymoney.necookie.dev/download/android always redirects to the
 * newest APK. Used by the QR code so a phone can install without signing in on the website first.
 */
export async function GET(request: Request) {
  const fallback = new URL('/settings#android', request.url);
  try {
    const { latest } = await fetchAndroidCatalog();
    if (!latest) return Response.redirect(fallback, 302);
    return new Response(null, {
      status: 302,
      headers: { location: latest.apk.url, 'cache-control': 'no-store' },
    });
  } catch {
    return Response.redirect(fallback, 302);
  }
}
