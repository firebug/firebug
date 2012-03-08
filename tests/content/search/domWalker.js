function calcExpectedContent() {
    document.normalize();

    var ret = [];
    var iframes = document.getElementsByTagName("iframe");
    var iframeOffset = 0;
    for (var expectedOffset = 0; expectedOffset < expectedContent.length; expectedOffset++)
    {
        if (!expectedContent[expectedOffset]) {
            var doc = (iframes[iframeOffset++] || {}).contentWindow;
            FBTest.ok(doc, "Document " + iframeOffset + " exists");
            var childElements = doc ? doc.calcExpectedContent() : [ undefined ];

            ret.push.apply(ret, childElements);
        } else {
            ret.push(expectedContent[expectedOffset]);
        }
    }
    FBTest.compare(iframeOffset, iframes.length, "All iframes used.");

    return ret;
}

function domWalkerBoundaryTest() {
    var walker = new FBL.DOMWalker(document, document.documentElement);

    while (walker.nextNode());
    FBTest.ok(!walker.nextNode(), "Past End Condition Holds");
    FBTest.ok(walker.previousNode(), "Past End -> End Move Succeeds");
    FBTest.ok(!walker.nextNode(), "Past End Condition Holds");

    walker.reset();
    while (walker.previousNode());
    FBTest.ok(!walker.previousNode(), "Past Start Condition Holds");
    FBTest.ok(walker.nextNode(), "Past Start -> Start Move Succeeds");
    FBTest.ok(!walker.previousNode(), "Past Start Condition Holds");
}
function domWalkerTest(expected, stepSize, reverse) {

    function walk(reverse) { return reverse ? walker.previousNode() : walker.nextNode(); }
    function checkName(expectedName, nodeName) {
        nodeName = (nodeName || "").toLowerCase();
        // Due to cross DOM issues we can not do instanceof Array. Since both
        // arrays and strings have length values, we test for the existence of
        // a string prototype method. It's ugly, but gets the job done.
        //
        // Note instanceof Array will cause Firefox to crash as of 3.1b2
        if (expectedName && !expectedName.toLowerCase) {
            for (var i = 0; i < expectedName.length; i++) {
                if (expectedName[i].toLowerCase() == nodeName) {
                    return false;
                }
            }
            return true;
        } else {
            return expectedName && expectedName.toLowerCase() != nodeName;
        }
    }
    function verifyNode(node, index) {
        var verifyFail = false;
        index = reverse ? expected.length - index - 1 : index;
        var expectedNode = expected[index];
        if (!node || !expectedNode) {
            FBTest.compare(expectedNode, node, "existence: " + index);
            verifyFail = true;
        }
        if (!verifyFail && expectedNode.type != node.nodeType) {
            FBTest.compare(expectedNode.type, node.nodeType, "nodeType: " + index + " " + node);
            verifyFail = true;
        }
        if (!verifyFail && checkName(expectedNode.name, node.localName)) {
            FBTest.compare(
                    expectedNode.name,
                    node.localName,
                    "nodeName: " + index);
            verifyFail = true;
        }
        if (verifyFail) {
            FBTrace.sysout("domWalkerTest: " + index, node);
            FBTrace.sysout("domWalkerTest_expected: " + index, expectedNode);
        }
        return verifyFail;
    }

    var walker = new FBL.DOMWalker(document, document.documentElement);
    var failed = false;

    for (var elIter = 0; elIter < expected.length - stepSize + 1; elIter++) {
        for (var stepIter = 0; stepIter < stepSize; stepIter++) {
            walk(reverse);
        }
        for (var stepIter = 0; stepIter < stepSize-1; stepIter++) {
            walk(!reverse);
        }
        failed = verifyNode(walker.currentNode(), elIter) || failed;
    }

    // TODO : Test the overflow cases a little bit more

    // We should be at the end now, reset and verify that we can walk once
    walker.reset();
    failed = verifyNode(walk(reverse), 0) || failed;

    FBTest.ok(!failed, "domWalkerTest: " + stepSize + " " + reverse + " " + expected.length);
}
