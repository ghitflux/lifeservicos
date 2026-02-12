import { NextRequest, NextResponse } from 'next/server';

// Backend FastAPI URL (sempre localhost quando frontend e backend estão na mesma máquina)
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';

async function proxyRequest(request: NextRequest, pathParts: string[]) {
  try {
    const path = pathParts.join('/');
    const url = `${API_BASE_URL}/${path}`;

    // Obter query parameters
    const searchParams = new URL(request.url).searchParams;
    const queryString = searchParams.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    console.log(`[API Proxy] ${request.method} ${fullUrl}`);

    // Preparar headers
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Encaminhar cookies do browser para o backend
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // Encaminhar CSRF token se presente
    const csrfToken = request.headers.get('x-csrf-token');
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // Encaminhar Authorization header se presente
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Preparar body para métodos que permitem
    let body: string | undefined;
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      try {
        const requestBody = await request.json();
        body = JSON.stringify(requestBody);
      } catch {
        // Body vazio ou inválido
        body = undefined;
      }
    }

    // Fazer requisição ao backend
    const response = await fetch(fullUrl, {
      method: request.method,
      headers,
      body,
      credentials: 'include',
    });

    // Obter resposta do backend
    const responseData = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(responseData);
    } catch {
      jsonData = { data: responseData };
    }

    console.log(`[API Proxy] Response ${response.status}`);

    // Criar resposta para o frontend
    const nextResponse = NextResponse.json(jsonData, {
      status: response.status,
    });

    // Encaminhar Set-Cookie headers do backend para o browser
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      nextResponse.headers.set('Set-Cookie', setCookieHeader);
    }

    return nextResponse;
  } catch (error: any) {
    console.error('[API Proxy Error]', error);
    return NextResponse.json(
      {
        error: 'proxy_error',
        message: error.message || 'Erro ao comunicar com o backend',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  return proxyRequest(request, params.path);
}
