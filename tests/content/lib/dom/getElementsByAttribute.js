function runTest()
{
    var div = document.createElement("div");
    div.setAttribute("data-test", "\"value with quotes and backslash '\\'\"");
    div.setAttribute("data-test2", "");
    document.body.appendChild(div);

    verifyResult(2, document, "id");
    verifyResult(1, document, "id", "testTitle");
    verifyResult(1, document, "data-test");
    verifyResult(1, document, "data-test", "\"value with quotes and backslash '\\'\"");
    verifyResult(1, document, "data-test2", "");
    verifyResult(2, document.body, "id");
    verifyResult(1, document.body, "id", "testTitle");
    verifyResult(0, document.body, "test");
    var docFrag = document.createDocumentFragment();
    var div = document.createElement("div");
    div.setAttribute("id", "test");
    docFrag.appendChild(div);
    verifyResult(1, docFrag, "id");
    verifyResult(1, docFrag, "id", "test");
    verifyResult(0, docFrag, "id", "hello");
    verifyResult(null, null, "id");
    verifyResult(null, "notANode", "id");
    verifyResult(null, {test: "hi"}, "id");

    FBTest.testDone();
}

function verifyResult(expected, node, attrName, attrValue)
{
    try
    {
        var result = FW.FBL.getElementsByAttribute(node, attrName, attrValue);
    }
    catch(e)
    {
        if (expected !== null)
        {
            FBTest.ok(false, "An unexpected exception was thrown: " + e.message);
        }
        else
        {
            FBTest.compare("'node' is invalid", e.message,
                "Exception must be thrown for invalid 'node'");
        }
        return;
    }

    if (FBTest.ok(result instanceof NodeList || Array.isArray(result),
        "Returned value must be an array or a NodeList"))
    {
        FBTest.compare(expected, result.length,
            "'node' must contain " + expected + " element" + (expected !== 1 ? "s" : "") +
            " with '" + attrName + "' as attribute name" +
            (attrValue !== undefined ? " and '" + attrValue + "' as its value" : ""));
    }
}