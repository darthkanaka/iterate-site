/**
 * Iterate: website contact form.
 *
 * Runs as a Google Apps Script web app under kawika@elevatemediahi.com. The
 * contact form on iteratehi.com posts here (site.js, "Contact form", sends
 * first, last, email, phone, sms, message, heard and page). Each enquiry is
 * logged to a Google Sheet first, then emailed with Reply-To set to the
 * sender, so answering it is just hitting Reply.
 *
 * Logged before emailed on purpose: if the email ever fails, the enquiry is
 * still in the sheet, and the failure itself is emailed.
 *
 * The email goes straight to kawika@elevatemediahi.com, not to
 * aloha@iteratehi.com. aloha@ forwards to that same inbox, and Gmail hides a
 * message that left an account and came back to it through a forwarder, so
 * sending to aloha@ could make enquiries vanish.
 *
 * A blind copy goes to thekawikalopez@gmail.com, the inbox the morning
 * briefing reads. Gmail doesn't forward mail an account sent to itself, so
 * without the copy, enquiries never reach the briefing. Blind, so a Reply All
 * never shows that address to the person who wrote in.
 *
 * The sheet is shared (view only) with kaveex@gmail.com when it is created,
 * so the monthly site report can count enquiries with the Google sign-in it
 * already uses.
 *
 * DEPLOY (one time)
 *   1. script.google.com, signed in as kawika@elevatemediahi.com, New project.
 *      Name it "Iterate contact form".
 *   2. Replace the sample code with this file. Save.
 *   3. Deploy > New deployment > type Web app
 *        Execute as:      Me
 *        Who has access:  Anyone
 *   4. Authorise when asked. Copy the Web app URL ending in /exec. It goes in
 *      the data-endpoint attribute of the form in contact.html.
 *
 * CHANGING IT LATER
 *   Deploy > Manage deployments > pencil > Version: New version.
 *   "New deployment" mints a new URL and the site keeps posting to the old one.
 */

var INBOX = 'kawika@elevatemediahi.com';
var BRIEFING = 'thekawikalopez@gmail.com';
var REPORT_READER = 'kaveex@gmail.com';
var SHEET_NAME = 'Iterate website enquiries';
var HEADERS = ['Received', 'First name', 'Last name', 'Email', 'Phone', 'Text consent', 'Heard about us', 'Message', 'Page'];

function doPost(e) {
  var p = (e && e.parameter) || {};
  try {
    // Honeypot: a field people never see. Anything that fills it is a bot.
    // Answer "ok" so the bot learns nothing.
    if (p.website) return ContentService.createTextOutput('ok');

    var first = clean(p.first, 80);
    var last = clean(p.last, 80);
    var email = clean(p.email, 200);
    var phone = clean(p.phone, 40);
    var sms = clean(p.sms, 3) === 'yes' ? 'yes' : 'no';
    var heard = clean(p.heard, 80);
    var message = clean(p.message, 5000);
    var page = clean(p.page, 200);
    if (!first || !last || !email || !message || email.indexOf('@') < 1) {
      return ContentService.createTextOutput('no');
    }

    log([new Date(), first, last, email, phone, phone ? sms : '', heard, message, page]);

    var name = first + ' ' + last;
    MailApp.sendEmail({
      to: INBOX,
      bcc: BRIEFING,
      replyTo: email,
      name: 'Iterate website',
      subject: 'Iterate enquiry from ' + name,
      body: 'Name:            ' + name + '\n'
          + 'Email:           ' + email + '\n'
          + 'Phone:           ' + (phone || '(none)') + '\n'
          + (phone ? 'Text consent:    ' + sms + '\n' : '')
          + 'Heard about us:  ' + (heard || '(not said)') + '\n'
          + 'Page:            ' + (page || '(unknown)') + '\n\n'
          + message + '\n\n'
          + '--\nReply to this email to answer ' + first + ' directly.'
    });
    return ContentService.createTextOutput('ok');

  } catch (err) {
    try {
      MailApp.sendEmail({
        to: INBOX,
        bcc: BRIEFING,
        subject: 'Iterate: contact form FAILED',
        body: 'A website enquiry hit an error. What arrived:\n\n'
            + JSON.stringify(p, null, 2) + '\n\n'
            + (err && err.stack ? err.stack : String(err))
      });
    } catch (ignored) {}
    return ContentService.createTextOutput('error');
  }
}

// Opening the /exec URL in a browser should show this, which confirms the
// deployment is live and reachable.
function doGet() {
  return ContentService.createTextOutput('Iterate contact form endpoint is live.');
}

function clean(v, max) {
  return String(v || '').replace(/\s+$/g, '').slice(0, max).trim();
}

// The sheet is created on the first enquiry and its ID remembered, so there is
// nothing to set up by hand.
function log(row) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(SHEET_NAME);
    ss.getSheets()[0].appendRow(HEADERS);
    ss.getSheets()[0].setFrozenRows(1);
    try { ss.addViewer(REPORT_READER); } catch (e) {}
    props.setProperty('SHEET_ID', ss.getId());
  }
  ss.getSheets()[0].appendRow(row);
}
