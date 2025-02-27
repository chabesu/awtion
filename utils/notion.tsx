import blogConfig from "@/blog.config";
import { CodeBlock } from "@/components/notion/CodeBlock";
import { Text } from "@/components/notion/Text";
import Tweets from "@/components/notion/Twitter";

import { Client } from "@notionhq/client";
import {
  QueryDatabaseParameters,
  PageObjectResponse,
  BlockObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { Fragment } from "react";
import { renderToString } from "react-dom/server";
import { parseYouTubeVideoId } from "@/utils/youtube";
import { Article } from "../types";

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

export const getDatabase = async (
  databaseId: string,
  args: Omit<QueryDatabaseParameters, "database_id"> = {}
) => {
  const response = await notion.databases.query({
    database_id: databaseId,
    ...args,
  });
  const { results } = response;
  const posts = results.map((result: PageObjectResponse) => {
    const d = result.properties;
    const item = {
      thumbnail: "",
      authors: "",
      slug: "",
      published: "no",
      date: "",
      description: "",
      page: "",
      id: result.id,
      category: "",
      tags: [],
    };
    Object.keys(d).forEach((key) => {
      const property = d[key];
      if (property.type === "people") {
        item[key.toLowerCase()] = property.people
          .map((p) => (p as any).name)
          .join(",");
      } else if (property.type === "rich_text") {
        item[key.toLowerCase()] = property.rich_text[0]?.plain_text;
      } else if (property.type === "files") {
        if (property.files[0]?.type === "external") {
          item[key.toLowerCase()] = property.files[0].name;
        } else {
          item[key.toLowerCase()] = property.files[0]?.file?.url;
        }
      } else if (property.type === "title") {
        item[key.toLowerCase()] = property.title[0]?.plain_text;
      } else if (property.type === "checkbox") {
        item[key.toLowerCase()] = property.checkbox;
      } else if (property.type === "multi_select") {
        property.multi_select.map((e) => item[key.toLowerCase()].push(e.name));
      } else if (property.type === "select") {
        item[key.toLowerCase()] = property.select?.name;
      } else if (property.type === "date") {
        item[key.toLowerCase()] = property.date?.start;
      }
    });
    // console.log(item);
    return {
      content: "",
      data: {
        tags: item.tags,
        title: item.page,
        date: item.date,
        category: item.category,
        writtenBy: item.authors,
        thumbnail: item.thumbnail,
        description: item.description,
        status: item.published ? "open" : "draft",
      },
      permalink: `${blogConfig.siteUrl}/${item.category}/${item.slug}`,
      slug: item.slug,
      id: item.id,
      excerpt: "",
      related: [],
    } as Article;
  });

  return posts;
};

export const getPage = async (pageId: string) => {
  const response = await notion.pages.retrieve({ page_id: pageId });
  return response;
};

export const getBlocks = async (blockId: string) => {
  const response = await notion.blocks.children.list({
    block_id: blockId,
    page_size: 100,
  });
  return response.results as BlockObjectResponse[];
};

const renderBlock = (block: BlockObjectResponse) => {
  const { type, id } = block;
  const value = block[type];

  switch (type) {
    case "paragraph":
      return (
        <p>
          <Text text={block.paragraph.rich_text} />
        </p>
      );
    case "code":
      return (
        <CodeBlock text={block.code.rich_text} lang={block.code.language} />
      );
    case "heading_1":
      return (
        <h1>
          <Text text={block.heading_1.rich_text} />
        </h1>
      );
    case "heading_2":
      return (
        <h2>
          <Text text={block.heading_2.rich_text} />
        </h2>
      );
    case "heading_3":
      return (
        <h3>
          <Text text={block.heading_3.rich_text} />
        </h3>
      );
    case "bulleted_list_item":
    case "numbered_list_item":
      return (
        <li>
          <Text text={value.rich_text} />
        </li>
      );
    case "to_do":
      return (
        <div>
          <label htmlFor={id}>
            <input type="checkbox" id={id} defaultChecked={value.checked} />{" "}
            <Text text={block.to_do.rich_text} />
          </label>
        </div>
      );
    case "toggle":
      return (
        <details>
          <summary>
            <Text text={block.toggle.rich_text} />
          </summary>
          {value.children?.map((b) => (
            <Fragment key={b.id}>{renderBlock(b)}</Fragment>
          ))}
        </details>
      );
    case "child_page":
      return <p>{value.title}</p>;
    case "image":
      // eslint-disable-next-line no-case-declarations
      const image = block[type];
      // eslint-disable-next-line no-case-declarations
      const src =
        image.type === "external" ? image.external.url : image.file.url;
      // eslint-disable-next-line no-case-declarations
      const caption = image.caption ? image.caption[0]?.plain_text : "";
      return (
        <figure>
          <img src={src} alt={caption} />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      );
    case "bookmark":
      return (
        <iframe
          title="bookmark"
          src={`/embed/?url=${block.bookmark.url}`}
          className="embed"
        />
      );
    case "embed":
      if (/^https:\/\/twitter\.com/.test(block.embed.url)) {
        return <Tweets block={block} />;
      }
      return <iframe title="embed" src={block.embed.url} className="embed" />;
    case "child_database":
      return <div>{block.child_database.title}</div>;
    case "divider":
      return <hr />;
    case "quote":
      return (
        <div className="quote">
          <div className="quote-prepend">“</div>
          <div className="quote-inner">
            <Text text={block.quote.rich_text} />
          </div>
          <div className="quote-append">”</div>
        </div>
      );
    case "callout":
      return (
        <div className="callout">
          {block.callout.icon.type === "emoji" && (
            <span>{block.callout.icon.emoji}</span>
          )}
          <div className="callout-inner">
            <Text text={block.callout.rich_text} />
          </div>
        </div>
      );
    case "column_list":
      return (
        <div className="flex">
          {(block.column_list.children as any).map((c) => renderBlock(c))}
        </div>
      );
    case "column":
      return <div className="flex-1">カラム</div>;
    default:
      return `❌ Unsupported block (${
        type === "unsupported" ? "unsupported by Notion API" : type
      })`;
    case "video": {
      let youtubeurl: URL;
      try {
        youtubeurl = new URL(value.external.url);
      } catch {
        return null;
      }

      const videoId = parseYouTubeVideoId(youtubeurl);
      if (videoId === "") {
        return null;
      }

      return (
        <div className="video">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            key={videoId}
          />
        </div>
      );
    }
  }
};

export const getNotionArticle = (blocks: BlockObjectResponse[]) => {
  if (!blocks) {
    return <div />;
  }

  return (
    <div className="bg-white py-6 sm:py-8 lg:py-12">
      <article className="max-w-screen-md px-4 md:px-8 mx-auto">
        <section>
          {blocks.map((block) => (
            <Fragment key={block.id}>{renderBlock(block)}</Fragment>
          ))}
        </section>
      </article>
    </div>
  );
};

export const getArticleFromNotion = async (slug: string) => {
  const posts = await getDatabase(process.env.NOTION_DATABASE_ID as string);
  const post = posts.find((p) => p.slug === slug);
  const page = await getPage(post.id);
  const blocks = await getBlocks(post.id);
  const childBlocks = await Promise.all(
    blocks
      .filter((block) => block.has_children)
      .map(async (block) => {
        return {
          id: block.id,
          children: await getBlocks(block.id),
        };
      })
  );
  const childDatabasedBlocks = await Promise.all(
    blocks
      .filter((block) => block.type === "child_database")
      .map(async (block) => {
        return {
          id: block.id,
          // children: await getDatabase(block.id)
        };
      })
  );

  const blocksWithChildren = blocks.map((block) => {
    if (block.has_children && !block[block.type].children) {
      // eslint-disable-next-line no-param-reassign
      block[block.type].children = childBlocks.find(
        (x) => x.id === block.id
      )?.children;
    }
    return block;
  });

  const blocksWithChildDatabase = blocksWithChildren.map((block) => {
    if (block.type === "child_database") {
      // block[block.type]['children'] = childDatabasedBlocks.find(
      //   (x) => x.id === block.id
      // )?.children
    }
    return block;
  });

  const article = {
    ...post,
    content: renderToString(
      <div>{getNotionArticle(blocksWithChildDatabase)}</div>
    ),
  } as Article;

  return {
    article,
    related: [],
  };
};
