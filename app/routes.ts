import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/convert", "routes/api.convert.ts"),
  route("api/convert-document", "routes/api.convert-document.ts"),
  route("api/document-jobs/:id", "routes/api.document-jobs.ts"),
] satisfies RouteConfig;
