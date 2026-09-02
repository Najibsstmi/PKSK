# PKSK Prospect to Premium - Zoho Import Guide

Workflow name:

`PKSK Prospect to Premium`

Master list:

`pksk academy`

Sender:

- From Name: `PKSK Academy`
- From Email: `admin@cikgustem.com`
- Reply-to: `admin@cikgustem.com`

## Email Sequence

1. `PKSK Prospect Email 01 - Preparation`
   - Timing: immediately
   - Subject: `Anak dah bersedia untuk PKSK sebenar?`
   - Preheader: `Cuba 3 perkara ini sebelum anak menghadapi ujian PKSK.`
   - HTML: `pksk-prospect-email-01-preparation.html`

2. `PKSK Prospect Email 02 - Time Pressure`
   - Timing: after 2 days, only if `Subscription Status = prospect`
   - Subject: `Anak boleh jawab soalan, tapi sempatkah bila masa berjalan?`
   - Preheader: `Ramai calon tahu jawapan. Cabarannya ialah menjawab dengan tepat dalam masa yang terhad.`
   - HTML: `pksk-prospect-email-02-time-pressure.html`

3. `PKSK Prospect Email 03 - Premium Value`
   - Timing: after 2 days, only if `Subscription Status = prospect`
   - Subject: `Apa yang anak dapat dengan PKSK Academy Premium?`
   - Preheader: `Lihat bagaimana simulasi tambahan, latihan tersusun dan analisis membantu persediaan anak.`
   - HTML: `pksk-prospect-email-03-premium-value.html`

4. `PKSK Prospect Email 04 - Confidence`
   - Timing: after 2 days, only if `Subscription Status = prospect`
   - Subject: `Latihan biasa cukup ke untuk PKSK sebenar?`
   - Preheader: `Yang mahu dilatih bukan cuma jawapan, tetapi kebiasaan menjawab dalam format dan tekanan masa.`
   - HTML: `pksk-prospect-email-04-confidence.html`

5. `PKSK Prospect Email 05 - Final Follow Up`
   - Timing: after 2 days, only if `Subscription Status = prospect`
   - Subject: `Jangan tunggu sehingga hari PKSK`
   - Preheader: `Mulakan latihan kecil hari ini supaya anak lebih biasa sebelum ujian sebenar.`
   - HTML: `pksk-prospect-email-05-final-follow-up.html`

## Workflow Structure

Added To List: `pksk academy`

If/Else: `Subscription Status = prospect`

TRUE:

Email 1
-> Time Delay: 2 days, Malaysia GMT+8, Mon-Fri if enabled
-> If/Else: `Subscription Status = prospect`

TRUE:

Email 2
-> Time Delay: 2 days, Malaysia GMT+8, Mon-Fri if enabled
-> If/Else: `Subscription Status = prospect`

TRUE:

Email 3
-> Time Delay: 2 days, Malaysia GMT+8, Mon-Fri if enabled
-> If/Else: `Subscription Status = prospect`

TRUE:

Email 4
-> Time Delay: 2 days, Malaysia GMT+8, Mon-Fri if enabled
-> If/Else: `Subscription Status = prospect`

TRUE:

Email 5

FALSE branches:

Stop. Do not send more prospect emails.

## Launch Checklist

- Zoho workflow has no required errors.
- `Company Address Required` is resolved with the real company address.
- Sender is `PKSK Academy <admin@cikgustem.com>`.
- Reply-to is `admin@cikgustem.com`.
- SPF is verified in Zoho.
- DKIM is verified in Zoho.
- Test email sent and checked on desktop.
- Test email checked on mobile.
- CTA links open `https://pksk.cikgustem.com/`.
- Each imported HTML includes only one Zoho unsubscribe link.
- No Base64 images.
- No local image references.
- Workflow remains draft until all checks pass.

## Public Assets Used

- Logo: `https://pksk.cikgustem.com/assets/pksk-academy-logo.png`
- Email 2 image: `https://pksk.cikgustem.com/assets/email/pksk-email-02.png`
