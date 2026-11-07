import { fetchAndroidCatalog } from '@/lib/android-releases';

/**
 * Public JSON catalogue of Android APK releases (used by the web install card and by the
 * Android app's update check). Contains only public release metadata.
 */
export async function GET() {
  try {
    const catalog = await fetchAndroidCatalog();
    return Response.json(catalog, {
      headers: {
        'cache-control': 'public, max-age=60, s-maxage=300',
        'access-control-allow-origin': '*',
      },
    });
  } catch (err) {
    return Response.json(
      { error: { code: 'releases_unavailable', message: (err as Error).message } },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
