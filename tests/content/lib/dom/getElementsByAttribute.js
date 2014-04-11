function runTest()
{
    var tasks = new FBTest.TaskList();
    tasks.push(verifyResult, 2, document, "id");
    tasks.push(verifyResult, 1, document, "id", "testTitle");
    tasks.push(verifyResult, 0, document, "test");
    tasks.push(verifyResult, 2, document.body, "id");
    tasks.push(verifyResult, 1, document.body, "id", "testTitle");
    tasks.push(verifyResult, 0, document.body, "test");
    var docFrag = document.createDocumentFragment();
    var div = document.createElement("div");
    div.setAttribute("id", "test");
    docFrag.appendChild(div);
    tasks.push(verifyResult, 1, docFrag, "id");
    tasks.push(verifyResult, 1, docFrag, "id", "test");
    tasks.push(verifyResult, 0, docFrag, "id", "hello");
    tasks.push(verifyResult, 0, null, "id");
    tasks.push(verifyResult, 0, "notANode", "id");
    tasks.push(verifyResult, 0, {test: "hi"}, "id");

    tasks.run(FBTest.testDone, 0);
}

function verifyResult(callback, expected, node, attrName, attrValue)
{
    var result = FW.FBL.getElementsByAttribute(node, attrName, attrValue);
    FBTrace.sysout("result " + (typeof result), result);
    if (FBTest.ok(result instanceof NodeList || Array.isArray(result),
        "Returned value must be an array or a NodeList"))
    {
        FBTest.compare(expected, result.length,
            "'node' must contain " + expected + " element" + (expected !== 1 ? "s" : "") +
            " with '" + attrName + "' as attribute name" +
            (attrValue ? " and '" + attrValue + "' as its value" : ""));
    }

    callback();
}