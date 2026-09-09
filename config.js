/* ==========================================================================
   config.js — THE ONLY FILE YOU NEED TO EDIT TO CHANGE THE LOGIN

   Change a setting here, save the file, upload it to GitHub, and the change
   is live. Nothing else has to be touched.
   ========================================================================== */

const CONFIG = {

  /* Turn the login screen on or off.
     false removes it entirely and the simulation starts at the start screen. */
  requireLogin: true,

  /* The username candidates type. Change it to whatever you like. */
  username: "CaseMentor9187",

  /* ------------------------------------------------------------------------
     !!  THE PASSWORD BELOW IS A TEMPORARY ONE AND MUST BE CHANGED  !!

     The password this stands for is, right now:

         change-me-before-launch

     The real password is never written in this file. What is stored is a
     "hash" — a scrambled fingerprint of the password that cannot be turned
     back into it. The page scrambles whatever the candidate types the same
     way and compares the two fingerprints.

     To set your own password:
       1. Open tools/make-passcode.html in a browser.
       2. Type the password you want.
       3. Copy the long line of letters and numbers it prints.
       4. Paste it between the quotes below, replacing what is there.
       5. Save this file and upload it.

     Do not reuse the old simulation's password. It was written in plain text
     in a public file, so anybody who looked at the old page can read it.
     ---------------------------------------------------------------------- */
  passcodeHash: "22d1c9017df0929ef31cfd943bbc97d2adeff40c010e19d89f1a006943f2132c",

  /* ------------------------------------------------------------------------
     Should the simulation refuse to run outside your course?

     Ships as false, which means it runs anywhere. Switch it to true once you
     have confirmed in a real lesson which address the lesson runs under.

     Even when true, the check FAILS OPEN: if the browser gives no usable
     information about where the page was opened from, the simulation loads
     normally. A candidate who cannot start their assessment is a far worse
     outcome than somebody finding the page by accident.
     ---------------------------------------------------------------------- */
  blockDirectAccess: false,

  allowedEmbedDomains: ["app.casementor.com", "casementor.spayee.com"]
};
