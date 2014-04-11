function runTest()
{
    function object(name)
    {
        this.name = name;
    }

    object.prototype.toString = function()
    {
        return this.name;
    }

    verifyResult(["c", "a", "b"], ["a", "b"], 0, ["c"]);
    verifyResult(["a", "c", "b"], ["a", "b"], 1, ["c"]);
    verifyResult(["a", "b", "c"], ["a", "b"], 2, ["c"]);
    verifyResult(["a", "b", "c", "d"], ["a", "b"], 2, ["c", "d"]);
    verifyResult(["a", "b", "c", "d"], ["a", "d"], 1, ["b", "c"]);
    verifyResult([1, 2, 3], [1, 3], 1, [2]);
    verifyResult([new object("Peter"), new object("David"), new object("Frank")],
        [new object("Peter"), new object("Frank")], 1, [new object("David")]);

    FBTest.testDone();
}

function verifyResult(expected, array, index, newItems)
{
    var resultArray = FW.FBL.arrayInsert(array, index, newItems);
    FBTest.compare(expected.toString(), resultArray.toString(),
        "Item" + (newItems.length !== 1 ? "s" : "") +
        " must be correctly inserted into the array");
}