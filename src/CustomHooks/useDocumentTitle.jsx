import { useEffect } from "react";

/* Page titles carry the club's name so tabs and history read as KBG's, not
   as bare words ("Home", "Events"). Pages pass just their own name. */
const useDocumentTitle = (title) => {
  useEffect(() => {
    document.title = title
      ? `${title} · KBG — IIT Mandi`
      : "Kamand Bioengineering Group — IIT Mandi";
  }, [title]);
};

export default useDocumentTitle;