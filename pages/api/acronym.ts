import type { NextApiRequest, NextApiResponse } from "next";
import { Client } from "@notionhq/client";
import {
  RichTextPropertyValue,
  TitlePropertyValue,
} from "@notionhq/client/build/src/api-types";
import MiniSearch from "minisearch";

type SlackSlashCommandPayload = {
  token: string;
  team_id: string;
  team_domain: string;
  enterprise_id: string;
  enterprise_name: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
  api_app_id: string;
};

type SlackSlashCommandResponse = {
  response_type: "ephemeral" | "in_channel";
  text: string;
};

interface Acronym {
  acronym: string;
  description: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SlackSlashCommandResponse>
) {
  const payload: SlackSlashCommandPayload = req.body;
  const query = payload.text;

  const result = await searchAcronyms(query);
  const response = result?.join("\n") || `No matches found for ${query}`;

  res.status(200).json({
    response_type: "ephemeral",
    text: response,
  });
}

const createSearchIndex = (acronyms: Acronym[]): MiniSearch<Acronym> => {
  let miniSearch = new MiniSearch<Acronym>({
    fields: ["acronym", "description"],
    storeFields: ["acronym", "description"],
  });
  miniSearch.addAll(acronyms.map((a, i) => ({ id: i, ...a }))); // an id is required, so we just fake one

  return miniSearch;
};

export const searchAcronyms = async (
  query: string
): Promise<string[] | undefined> => {
  const acronyms = await fetchAcronymsFromNotion();
  let searchIndex = createSearchIndex(acronyms);
  const results = searchIndex.search(query, {
    boost: { acronym: 2 },
    fuzzy: 1,
  });

  if (results.length) {
    return results.map((result) => {
      const { acronym, description } = result;
      return [acronym, description].join(": ");
    });
  }
};

export const fetchAcronymsFromNotion = async (): Promise<Acronym[]> => {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const databaseId = process.env.NOTION_ACRONYM_DATABASE_ID;

  const response = await notion.databases.query({
    database_id: databaseId!,
  });

  const acronyms = response.results.map((page) => {
    const description = page.properties.Description as RichTextPropertyValue;
    const acronym = page.properties.Acronym as TitlePropertyValue;

    return {
      acronym: acronym.title[0].plain_text,
      description: description.rich_text[0].plain_text,
    };
  });

  return acronyms;
};
