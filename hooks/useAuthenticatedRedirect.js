"use client";

import { useEffect } from "react";

export default function useAuthenticatedRedirect(supabase, router) {
  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted && data.session) router.replace("/dashboard");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session && isMounted) router.replace("/dashboard");
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router, supabase]);
}
