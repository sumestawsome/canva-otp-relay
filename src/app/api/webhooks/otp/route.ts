import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, sender, subject, gmail_message_id, received_at, secret_key: bodySecret } = body

    // 1. Verify Secret Key (check custom header 'x-secret-key' or payload body 'secret_key')
    const headerSecret = request.headers.get('x-secret-key')
    const secretKey = headerSecret || bodySecret
    const expectedSecret = process.env.WEBHOOK_SECRET_KEY

    if (!expectedSecret || secretKey !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing secret key' },
        { status: 401 }
      )
    }

    // 2. Validate required fields
    if (!code || !sender || !gmail_message_id) {
      return NextResponse.json(
        { error: 'Bad Request: Missing required fields (code, sender, gmail_message_id)' },
        { status: 400 }
      )
    }

    // 3. Compute timestamps: received_at and expires_at (+10 minutes)
    const receivedDate = received_at ? new Date(received_at) : new Date()
    const validReceivedAt = isNaN(receivedDate.getTime()) ? new Date() : receivedDate
    const expiresDate = new Date(validReceivedAt.getTime() + 10 * 60 * 1000) // +10 minutes

    const receivedAtIso = validReceivedAt.toISOString()
    const expiresAtIso = expiresDate.toISOString()

    // Determine initial status based on current time
    const status = new Date() < expiresDate ? 'active' : 'expired'

    // 4. Instantiate Supabase Service Role Admin Client
    const supabase = createAdminClient()

    // 5. Upsert to Supabase with gmail_message_id conflict resolution (idempotency)
    const { data, error } = await supabase
      .from('otp_logs')
      .upsert(
        {
          code: String(code).trim(),
          sender: String(sender).trim(),
          subject: subject ? String(subject).trim() : 'Canva Login Code',
          gmail_message_id: String(gmail_message_id).trim(),
          received_at: receivedAtIso,
          expires_at: expiresAtIso,
          status,
        },
        {
          onConflict: 'gmail_message_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      console.error('[WEBHOOK OTP ERROR]', error)
      return NextResponse.json(
        { error: 'Failed to persist OTP record', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        message: 'OTP processed successfully',
        data,
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error('[WEBHOOK UNHANDLED ERROR]', err)
    return NextResponse.json(
      { error: 'Internal Server Error', details: err?.message || String(err) },
      { status: 500 }
    )
  }
}
