import type { EspansoDirectoryInfo } from "../../logic/espansoPaths";
import type { EspansoConfigPreview, EspansoConfigPreviewTreeNode } from "./types";

export function getEspansoMatchRootName(matchDir: string): string {
  const normalized = matchDir.replace(/[\\/]+$/u, "");
  const parts = normalized.split(/[\\/]/u).filter(Boolean);
  return parts[parts.length - 1] || normalized || "/";
}

export function getEspansoConfigAncestorPaths(relativePath: string): Set<string> {
  const paths = new Set<string>();
  const parts = relativePath.split("/");
  parts.pop();

  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    paths.add(current);
  }

  return paths;
}

export function findTreeNode(
  nodes: EspansoConfigPreviewTreeNode[],
  targetPath: string,
): EspansoConfigPreviewTreeNode | null {
  if (!targetPath) return null;
  for (const node of nodes) {
    if (
      node.path === targetPath ||
      node.relativePath === targetPath ||
      (node.preview && node.preview.config.path === targetPath)
    ) {
      return node;
    }
    if (node.children) {
      const found = findTreeNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

export function buildEspansoConfigPreviewTree(
  previews: EspansoConfigPreview[],
  directories: EspansoDirectoryInfo[] = [],
): EspansoConfigPreviewTreeNode[] {
  const root: EspansoConfigPreviewTreeNode[] = [];

  function getOrCreateDir(
    nodes: EspansoConfigPreviewTreeNode[],
    name: string,
    path: string,
    relativePath: string,
  ): EspansoConfigPreviewTreeNode {
    const existing = nodes.find((node) => node.isDir && node.path === path);
    if (existing) return existing;

    const dir: EspansoConfigPreviewTreeNode = {
      name,
      path,
      relativePath,
      isDir: true,
      snippetCount: 0,
      fileCount: 0,
      children: [],
    };
    nodes.push(dir);
    nodes.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    return dir;
  }

  // Register all directories first so empty folders are preserved in the tree
  for (const directory of directories) {
    const parts = directory.relativePath.split("/");
    let currentNodes = root;
    let currentPath = "";
    let currentRelPath = "";

    parts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      currentRelPath = currentRelPath ? `${currentRelPath}/${part}` : part;

      const dirNode = getOrCreateDir(currentNodes, part, currentPath, currentRelPath);
      currentNodes = dirNode.children || [];
    });
  }

  // Register files
  for (const preview of previews) {
    const parts = preview.config.relativePath.split("/");
    let currentNodes = root;
    let currentPath = "";
    let currentRelPath = "";

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      currentRelPath = currentRelPath ? `${currentRelPath}/${part}` : part;

      if (isLast) {
        if (!currentNodes.some((n) => !n.isDir && n.path === preview.config.path)) {
          currentNodes.push({
            name: part,
            path: preview.config.path,
            relativePath: currentRelPath,
            isDir: false,
            snippetCount: preview.snippetCount,
            fileCount: 1,
            preview,
          });
          currentNodes.sort(
            (a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name),
          );
        }
      } else {
        const dir = getOrCreateDir(currentNodes, part, currentPath, currentRelPath);
        dir.snippetCount += preview.snippetCount;
        dir.fileCount += 1;
        currentNodes = dir.children || [];
      }
    });
  }

  return root;
}

export function wrapEspansoConfigPreviewTreeWithMatchRoot(
  nodes: EspansoConfigPreviewTreeNode[],
  matchDir: string,
): EspansoConfigPreviewTreeNode[] {
  if (!matchDir) return nodes;

  const normalizedMatchDir = matchDir.replace(/[\\/]+$/u, "");

  return [
    {
      name: getEspansoMatchRootName(matchDir),
      path: normalizedMatchDir || matchDir,
      relativePath: "",
      isDir: true,
      isCollectionRoot: true,
      snippetCount: nodes.reduce((total, node) => total + node.snippetCount, 0),
      fileCount: nodes.reduce((total, node) => total + node.fileCount, 0),
      children: nodes,
    },
  ];
}
