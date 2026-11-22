import { expect, type APIRequestContext } from "@playwright/test";

export async function latestMailLink(request: APIRequestContext, email: string) {
  const mailbox = new URL("/view/latest.html", process.env.AUTH_TEST_MAILPIT_URL);
  mailbox.searchParams.set("query", `to:"${email}"`);
  let href: string | undefined;
  await expect
    .poll(async () => {
      const message = await request.get(mailbox.href);
      href = message.ok() ? (await message.text()).match(/href="([^"]+)"/)?.[1] : undefined;
      return Boolean(href);
    })
    .toBe(true);
  return new URL(href!.replaceAll("&amp;", "&"));
}
