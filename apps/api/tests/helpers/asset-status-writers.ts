import ts from "typescript";

/** SDD-AVL-11: tepat empat pemilik; repository adalah adapter tulis pemilik tersebut. */
export const STATUS_WRITERS = {
    "modules/m04-assets/repositories/asset.repository.ts": "AssetService",
    "modules/m04-assets/repositories/reservation-status.repository.ts": "slot-activation",
    "modules/m09-loans/repositories/loan.repository.ts": "LoanService",
    "modules/m12-maintenance/repositories/maintenance.repository.ts": "MaintenanceService",
} as const;
const WRITE_CALLERS: Readonly<Record<string, readonly string[]>> = {
    markDisposed: ["modules/m04-assets/services/disposal-adjustment.ts"],
    reinstateDisposed: ["modules/m04-assets/services/disposal-adjustment.ts"],
    reconcileStocktakeStatus: ["modules/m04-assets/services/stocktake-adjustment.ts"],
    restoreAfterRepair:["modules/m12-maintenance/services/execution.service.ts"],
    setUnderRepair:["modules/m12-maintenance/services/work-order.service.ts"],
    updateKondisi: ["modules/m04-assets/services/asset.service.ts"],
    tetapkanDireservasi: ["modules/m04-assets/services/reservation-status.ts"],
    kembalikanTersedia: ["modules/m04-assets/services/reservation-status.ts"],
    sinkronkanStatusDireservasi: ["worker/slot-jobs.ts"],
};

/** AST, bukan pencarian komentar: mengenali chain Kysely, variabel/spread dan SQL literal. */
export function statusWriterViolations(path: string, text: string): readonly string[] {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const variables = new Map<string, ts.Expression>();
    const collect = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) variables.set(node.name.text, node.initializer);
        ts.forEachChild(node, collect);
    };
    collect(source);
    const resolve = (expr: ts.Expression, seen = new Set<string>()): ts.Expression => {
        if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr) || ts.isNonNullExpression(expr)) return resolve(expr.expression, seen);
        if (ts.isIdentifier(expr) && variables.has(expr.text) && !seen.has(expr.text)) return resolve(variables.get(expr.text)!, new Set([...seen, expr.text]));
        return expr;
    };
    const name = (node: ts.Node): string | undefined => {
        if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
        if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) return node.expression.text;
        return undefined;
    };
    const assetTable = (value: string) => /^(?:public\.)?assets(?:\s+(?:as\s+)?\w+)?$/i.test(value);
    const chainIsAsset = (input: ts.Expression, seen = new Set<ts.Node>()): boolean => {
        const expr = resolve(input);
        if (seen.has(expr)) return false;
        seen.add(expr);
        if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
            const method = expr.expression.name.text;
            if (["updateTable", "insertInto", "mergeInto"].includes(method)) {
                const argument = expr.arguments[0] === undefined ? undefined : resolve(expr.arguments[0]);
                return argument !== undefined && ts.isStringLiteralLike(argument) && assetTable(argument.text);
            }
            return chainIsAsset(expr.expression.expression, seen);
        }
        if (ts.isPropertyAccessExpression(expr)) return chainIsAsset(expr.expression, seen);
        return false;
    };
    // Isian tak dapat dibuktikan bebas status (mis. set(input)) gagal agar penulis baru ditinjau.
    const mayWriteStatus = (input: ts.Expression, seen = new Set<ts.Node>()): boolean => {
        const expr = resolve(input);
        if (seen.has(expr)) return true;
        seen.add(expr);
        if (ts.isStringLiteralLike(expr)) return /^(?:assets\.)?status$/i.test(expr.text);
        if (ts.isArrowFunction(expr) && ts.isExpression(expr.body)) return mayWriteStatus(expr.body, seen);
        if (ts.isConditionalExpression(expr)) return mayWriteStatus(expr.whenTrue, new Set(seen)) || mayWriteStatus(expr.whenFalse, new Set(seen));
        if (ts.isArrayLiteralExpression(expr)) return expr.elements.some((item) => mayWriteStatus(item, new Set(seen)));
        if (!ts.isObjectLiteralExpression(expr)) return true;
        return expr.properties.some((property) => ts.isSpreadAssignment(property)
            ? mayWriteStatus(property.expression, new Set(seen))
            : property.name === undefined || name(property.name) === undefined || name(property.name) === "status");
    };
    const violations: string[] = [];
    const report = (node: ts.Node, reason: string) => {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${path}:${line + 1}: ${reason}`);
    };
    const allowed = Object.hasOwn(STATUS_WRITERS, path);
    const inAssetUpsert = (node: ts.Node): boolean => {
        for (let parent = node.parent; parent && !ts.isStatement(parent); parent = parent.parent) {
            if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "onConflict" && chainIsAsset(parent.expression.expression)) return true;
        }
        return false;
    };
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ts.isIdentifier(node.expression) ? node.expression.text : undefined;
            if (method && Object.hasOwn(WRITE_CALLERS, method) && !WRITE_CALLERS[method]!.includes(path)) report(node, `pemanggil ${method} di luar pemilik`);
            if (!allowed && ts.isPropertyAccessExpression(node.expression) && ["set", "values", "doUpdateSet"].includes(method ?? "") && (chainIsAsset(node.expression.expression) || (method === "doUpdateSet" && inAssetUpsert(node)))) {
                if (!node.arguments[0] || mayWriteStatus(node.arguments[0])) report(node, "penulis assets.status di luar empat pemilik");
            }
        }
        if (!allowed && (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node))) {
            const sql = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map((span) => ` ? ${span.literal.text}`).join("") : node.text;
            if (/\bupdate\s+(?:"?public"?\.)?"?assets"?(?:\s+(?:as\s+)?\w+)?\s+set\b[\s\S]*?\bstatus"?\s*=/i.test(sql)
                || /\binsert\s+into\s+(?:"?public"?\.)?"?assets"?\s*\([^)]*\bstatus\b/i.test(sql)) report(node, "SQL menulis assets.status di luar empat pemilik");
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return violations;
}
