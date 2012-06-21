<?php
    setcookie("TestCookie18", "1 + 2 = 3", time() + 86400, "/");
?>

<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<html>
<head>
    <title>Issue 18: Unescape cookie values</title>
    <link rel="stylesheet" href="../tests.css" type="text/css"/>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
</head>
<body>

<div class="topBar">
    <a href="http://code.google.com/p/firecookie/issues/detail?id=18">Issue 18</a>
</div>
<h1>Issue 18: Unescape cookie values</h1>
<i>Jan Odvarko, odvarko@gmail.com</i>

<ol>
<li>Open Firebug and enable Cookie panel.</li>
<li>Reload the page</li>
<li>There should be <i>TestCookie18</i> in the list. Expand it.</li>
<li>Verify that the <i>Value</i> tab displayes: <code>1 + 2 = 3</code></li>
<li>Verify that the <i>Raw Data</i> tab displayes: <code>1+%2B+2+%3D+3</code></li>
</ol>

</body>
</html>
