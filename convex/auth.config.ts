// Convex Auth Configuration for Supabase JWTs
// Format supported by this Convex version: default export with providers [{ domain, applicationID }]
// domain maps to JWT `iss`, applicationID maps to JWT `aud`.

export default {
  providers: [
    {
      domain: "https://wqyquvgduwjkyadkumkl.supabase.co/",
      applicationID: "authenticated",
    },
  ],
};


