import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  getLinksFromDatabase,
  saveLinkToDatabase,
  saveMultipleLinksToDatabase,
  deleteLinkFromDatabase,
  deleteMultipleLinksFromDatabase,
  seedLocalLinksToRedis,
  migrateDomainInDatabase,
  replaceAllLinksForTitle,
  deleteAllLinksForTitle,
  deleteEntireTitleWithAudit,
  reassignLinksInDatabase,
  replaceDomainForTitleInDatabase,
  updateTitleMetadata,
  updateEpisodeTitleInDatabase,
} from '@/lib/redisDb';
import { validateAdminAuth } from '@/lib/adminAuth';
import { isValidHttpUrl } from '@/lib/security';
import { getEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get('movieId') || searchParams.get('id');
    const action = searchParams.get('action');

    // Admin seed action to sync local links to Upstash cloud
    if (action === 'seed') {
      if (!(await validateAdminAuth(request))) {
        return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
      }
      const seedResult = await seedLocalLinksToRedis();
      return NextResponse.json(seedResult);
    }

    if (movieId) {
      // Optional Rust / Axum high-performance acceleration layer
      const rustApiUrl = getEnv('RUST_API_URL');
      if (rustApiUrl) {
        try {
          const rustRes = await fetch(`${rustApiUrl}/api/curated-links?id=${encodeURIComponent(movieId)}`, {
            signal: AbortSignal.timeout(2000),
          });
          if (rustRes.ok) {
            const rustData = await rustRes.json();
            const response = NextResponse.json(rustData);
            response.headers.set('X-Backend-Engine', 'rust-axum');
            return response;
          }
        } catch {
          // Fallback transparently to direct MongoDB Atlas engine
        }
      }

      const result = await getLinksFromDatabase(movieId);
      return NextResponse.json({
        success: true,
        links: result.links || [],
        source: result.source,
      });
    }

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)));
    const q = searchParams.get('q') || searchParams.get('search') || undefined;
    const category = searchParams.get('category') || undefined;
    const result = await getLinksFromDatabase(undefined, { page, limit, q, category });
    return NextResponse.json({
      success: true,
      allLinks: result.allLinks || {},
      total: result.total,
      page,
      limit,
      source: result.source,
    });
  } catch (err: any) {
    console.error('Error in GET /api/curated-links:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { movieId, link, links, action, oldDomain, newDomain } = body;

    // Handle global domain migration action
    if (action === 'migrate_domain') {
      if (!oldDomain || !newDomain) {
        return NextResponse.json({ error: 'oldDomain and newDomain are required' }, { status: 400 });
      }
      const migrationRes = await migrateDomainInDatabase(oldDomain, newDomain);
      return NextResponse.json(migrationRes);
    }

    const cleanMovieId = movieId !== undefined && movieId !== null ? String(movieId).trim() : '';
    if (!cleanMovieId || cleanMovieId.toLowerCase() === 'undefined' || cleanMovieId.toLowerCase() === 'null') {
      return NextResponse.json({ error: 'movieId is required and must be a valid identifier' }, { status: 400 });
    }

    // Handle specific title domain replacement
    if (action === 'replace_domain_for_title') {
      if (!oldDomain || !newDomain) {
        return NextResponse.json({ error: 'oldDomain and newDomain are required' }, { status: 400 });
      }
      const res = await replaceDomainForTitleInDatabase(movieId, oldDomain, newDomain);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json(res);
    }

    // Handle replacing the whole set of links for a title (Whole link replacement)
    if (action === 'replace_all_links') {
      const sanitizedLinks = Array.isArray(links) ? links : [];
      for (const l of sanitizedLinks) {
        if (!l?.url || !isValidHttpUrl(l.url)) {
          return NextResponse.json({ error: 'Invalid URL detected in replacement set: must be a valid http or https URL' }, { status: 400 });
        }
      }
      const result = await replaceAllLinksForTitle(movieId, sanitizedLinks, {
        movieTitle: body.movieTitle,
        posterPath: body.posterPath,
        backdropPath: body.backdropPath,
        mediaType: body.mediaType,
      });
      try { revalidatePath('/'); } catch {}
      return NextResponse.json(result);
    }

    // Handle fixing / updating title metadata directly (without TMDB search)
    if (action === 'update_title_metadata') {
      const result = await updateTitleMetadata(movieId, {
        newMovieId: body.newMovieId,
        movieTitle: body.movieTitle,
        year: body.year,
        releaseDate: body.releaseDate,
        mediaType: body.mediaType,
        posterPath: body.posterPath,
        backdropPath: body.backdropPath,
        overview: body.overview,
      });
      try { revalidatePath('/'); } catch {}
      return NextResponse.json(result);
    }

    // Handle updating an individual episode's title (Trakt / manual review)
    if (action === 'update_episode_title') {
      const seasonNumber = Number(body.seasonNumber ?? body.season);
      const episodeNumber = Number(body.episodeNumber ?? body.episode);
      const episodeTitle = String(body.episodeTitle ?? body.title ?? '').trim();
      const linkId = body.linkId ? String(body.linkId).trim() : undefined;

      if (isNaN(seasonNumber) || isNaN(episodeNumber)) {
        return NextResponse.json(
          { error: 'seasonNumber and episodeNumber are required and must be valid numbers' },
          { status: 400 }
        );
      }

      if (!episodeTitle) {
        return NextResponse.json(
          { error: 'episodeTitle cannot be empty' },
          { status: 400 }
        );
      }

      const manualTitleVerified =
        body.manualTitleVerified !== undefined ? Boolean(body.manualTitleVerified) : true;
      const forceOverwrite =
        body.forceOverwrite !== undefined ? Boolean(body.forceOverwrite) : true;

      const result = await updateEpisodeTitleInDatabase(movieId, {
        seasonNumber,
        episodeNumber,
        episodeTitle,
        linkId,
        manualTitleVerified,
        forceOverwrite,
      });

      try { revalidatePath('/'); } catch {}
      return NextResponse.json(result);
    }

    // Handle reassigning specific links from one title to another
    if (action === 'reassign_links') {
      const { currentMovieId, newMovieId, linkIds, newMetadata } = body;
      if (!currentMovieId || !newMovieId || !Array.isArray(linkIds) || linkIds.length === 0) {
        return NextResponse.json(
          { error: 'currentMovieId, newMovieId, and non-empty linkIds array are required' },
          { status: 400 }
        );
      }
      const result = await reassignLinksInDatabase(currentMovieId, newMovieId, linkIds, newMetadata);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json(result);
    }

    // Handle permanent deletion of an entire title with audit logging
    if (action === 'delete_entire_title') {
      const result = await deleteEntireTitleWithAudit(movieId);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json(result);
    }

    // Handle deleting all links for a specific title
    if (action === 'delete_all_links') {
      const result = await deleteAllLinksForTitle(movieId);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json(result);
    }

    // Support batch saving multiple links at once
    if (Array.isArray(links) && links.length > 0) {
      // Validate all URLs in batch
      for (const l of links) {
        if (!l?.url || !isValidHttpUrl(l.url)) {
          return NextResponse.json({ error: 'Invalid URL detected in batch: must be a valid http or https URL' }, { status: 400 });
        }
      }

      const meta = body.metadata || {
        movieTitle: body.movieTitle,
        mediaType: body.mediaType,
        posterPath: body.posterPath,
        backdropPath: body.backdropPath,
        releaseDate: body.releaseDate,
        voteAverage: body.voteAverage,
      };
      const sanitizedLinks = links.map((l, index) => ({
        ...l,
        id: l.id || `bulk-admin-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: l.createdAt || new Date(Date.now() - index * 1000).toISOString(),
        ...(meta.movieTitle && !l.movieTitle ? { movieTitle: meta.movieTitle } : {}),
        ...(meta.mediaType && !l.mediaType ? { mediaType: meta.mediaType } : {}),
        ...(meta.posterPath && !l.posterPath ? { posterPath: meta.posterPath } : {}),
        ...(meta.backdropPath && !l.backdropPath ? { backdropPath: meta.backdropPath } : {}),
        ...(meta.releaseDate && !l.releaseDate ? { releaseDate: meta.releaseDate } : {}),
        ...(meta.voteAverage && typeof l.voteAverage !== 'number' ? { voteAverage: meta.voteAverage } : {}),
      }));
      await saveMultipleLinksToDatabase(movieId, sanitizedLinks, meta);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json({ success: true, count: sanitizedLinks.length, links: sanitizedLinks });
    }

    if (!link || !link.url) {
      return NextResponse.json({ error: 'movieId and link.url are required' }, { status: 400 });
    }

    if (!isValidHttpUrl(link.url)) {
      return NextResponse.json({ error: 'Invalid link.url: must be a valid http or https URL' }, { status: 400 });
    }

    const linkId = link.id || `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const meta = body.metadata || {
      movieTitle: body.movieTitle,
      mediaType: body.mediaType,
      posterPath: body.posterPath,
      backdropPath: body.backdropPath,
      releaseDate: body.releaseDate,
      voteAverage: body.voteAverage,
    };
    const linkObj = {
      ...link,
      id: linkId,
      createdAt: link.createdAt || new Date().toISOString(),
      ...(meta.movieTitle && !link.movieTitle ? { movieTitle: meta.movieTitle } : {}),
      ...(meta.mediaType && !link.mediaType ? { mediaType: meta.mediaType } : {}),
      ...(meta.posterPath && !link.posterPath ? { posterPath: meta.posterPath } : {}),
      ...(meta.backdropPath && !link.backdropPath ? { backdropPath: meta.backdropPath } : {}),
      ...(meta.releaseDate && !link.releaseDate ? { releaseDate: meta.releaseDate } : {}),
      ...(meta.voteAverage && typeof link.voteAverage !== 'number' ? { voteAverage: meta.voteAverage } : {}),
    };

    await saveLinkToDatabase(movieId, linkObj);
    try { revalidatePath('/'); } catch {}

    return NextResponse.json({ success: true, link: linkObj });
  } catch (err: any) {
    console.error('Error in POST /api/curated-links:', err);
    const isPersistenceErr = err.message && err.message.includes('persistence unavailable');
    return NextResponse.json(
      { error: err.message },
      { status: isPersistenceErr ? 503 : 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await validateAdminAuth(request))) {
    return NextResponse.json({ error: 'Unauthorized: admin access required' }, { status: 401 });
  }

  try {
    // 1. Check for JSON body batch deletion
    let body: any = null;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        body = await request.json();
      } catch {}
    }

    if (body && Array.isArray(body.items) && body.items.length > 0) {
      await deleteMultipleLinksFromDatabase(body.items);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json({ success: true, count: body.items.length });
    }

    // 2. Query param deletion
    const { searchParams } = new URL(request.url);
    const movieId = searchParams.get('movieId') || searchParams.get('id');
    const linkId = searchParams.get('linkId');
    const linkIds = searchParams.get('linkIds');

    if (movieId && linkIds) {
      const ids = linkIds.split(',').map((s) => s.trim()).filter(Boolean);
      await deleteMultipleLinksFromDatabase(ids.map((id) => ({ movieId, linkId: id })));
      try { revalidatePath('/'); } catch {}
      return NextResponse.json({ success: true, count: ids.length });
    }

    if (movieId && linkId) {
      await deleteLinkFromDatabase(movieId, linkId);
      try { revalidatePath('/'); } catch {}
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'movieId and linkId required' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in DELETE /api/curated-links:', err);
    const isPersistenceErr = err.message && err.message.includes('persistence unavailable');
    return NextResponse.json(
      { error: err.message },
      { status: isPersistenceErr ? 503 : 500 }
    );
  }
}
