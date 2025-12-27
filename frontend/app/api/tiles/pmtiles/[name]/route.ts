import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    
    // Forward the request to the backend with all headers
    const backendUrl = `${BACKEND_URL}/api/tiles/pmtiles/${name}`;
    
    // Get the range header from the incoming request
    const rangeHeader = request.headers.get('range');
    
    const headers: HeadersInit = {};
    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch from backend' },
        { status: response.status }
      );
    }

    // Get the response data
    const data = await response.arrayBuffer();
    
    // Create response with proper headers
    const responseHeaders = new Headers();
    
    // Copy important headers from backend response
    const headersToCopy = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
      'cache-control'
    ];
    
    headersToCopy.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });
    
    // Ensure Accept-Ranges is set
    if (!responseHeaders.has('accept-ranges')) {
      responseHeaders.set('Accept-Ranges', 'bytes');
    }
    
    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error proxying PMTiles request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
