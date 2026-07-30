const test = async () => {
  try {
    const res = await fetch("https://voice-cloning-ai-beige.vercel.app/api/session", { method: "POST" });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Body:", text);
  } catch(e) {
    console.error(e);
  }
};
test();
