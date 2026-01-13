import { NextRequest, NextResponse } from 'next/server';
import { createUser, getUser, deleteUser, getAllUsers, addBalance } from '@/lib/db';

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');

  if (name) {
    const user = await getUser(name);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json(user);
  }

  const users = await getAllUsers();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const { name } = await request.json();

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const user = await createUser(name.trim());
  return NextResponse.json(user);
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  const success = await deleteUser(id);
  if (!success) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest) {
  const { userId, amount } = await request.json();

  if (!userId || typeof amount !== 'number') {
    return NextResponse.json({ error: 'User ID and amount are required' }, { status: 400 });
  }

  const result = await addBalance(userId, amount);
  
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
