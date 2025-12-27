import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

export async function GET(request: NextRequest) {
  try {
    const backendUrl = `${BACKEND_URL}/api/cog/fuel-legend`;
    
    const response = await fetch(backendUrl, {
      method: 'GET',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch from backend' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error proxying fuel legend request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
