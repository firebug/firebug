<?php
    setcookie("TestCookieXXX", "CookieValueXXX", mktime() + 86400, "/firecookie/tests/issueXXX");
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue XXX: </title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
</head>
<body>

<div class="topBar">
    <a href="../index.html">Test List</a> |
    <a href="http://code.google.com/p/firecookie/issues/detail?id=XXX">Issue XXX</a>
</div>
<h1>Issue XXX: {issue-summary}</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and enable the <b>Cookies</b> panel.</li>
<li></li>
</ol>

<button onclick="onExecuteTest()">Execute Test</button>

<script type="text/javascript">
function onExecuteTest()
{
}
</script>

</body>
</html>
