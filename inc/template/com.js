// This snippet will search for (current) url as link post on Reddit and HN.
// Collect all threads we find, and form a comment section out of it.
//
// The top buttons either link to a thread if one exists, or reddit/HN
// submit page to create one.

(function($)
{
	// URL to query.
	var url = $.location.href.split('#')[0];
	url = encodeURIComponent(url);

	// Create the comment div, and restore from cache if possible.
	var div = $.createElement('div');
	div.className = 'comments';

	////////////////
	var now = ((new Date().getTime()/1000)|0);
	var proto = $.location.protocol ;
	var reddit = proto + '//www.reddit.com';
	var reddit_s = reddit + '/search.json?type=link&sort=top&q=url:';
	var hn_s = proto + '//hn.algolia.com/api/v1/search?'
		+'restrictSearchableAttributes=url&query=';
	var hn_i = proto + '//hn.algolia.com/api/v1/items/';
	var hn = proto + '//news.ycombinator.com';

	// Insert topmost div
	var scripts = $.getElementsByTagName('script');
	var me = scripts[scripts.length-1];
	me.parentNode.insertBefore(div, me);

	if (sessionStorage && ((sessionStorage.getItem('com_expires')||0) > now)) {
		if (!window.performance || !window.performance.navigation ||
			window.performance.navigation.type != 1) {
			div.innerHTML = sessionStorage.getItem('com_cache');
			return;
		}
	}

	// Initialize top most elements.
	var hn_thread = hn + '/submitlink?u='
		+encodeURIComponent(document.location)
		+'&t='+encodeURIComponent(document.title);
	var reddit_thread = reddit + '/submit?title='
		+encodeURIComponent(document.title)
		+'&url=' + encodeURIComponent(document.location);
	div.innerHTML =
		'<a class="button" id="r_submit" href="'+reddit_thread
		+'"><button onclick="this.parentNode.click()&&false;">'
		+'Post Reddit comment</button></a>'
		+'<a class="button" id="hn_submit" href="'+hn_thread
		+'"><button onclick="return this.parentNode.click()&&false;">'
		+'Post HN comment</button></a><br/>';

	// Content divs.
	var reddit_div = $.createElement('div');
	var hn_div = $.createElement('div');

	// Ordering.
	div.appendChild(hn_div);
	div.appendChild(reddit_div);

	function save_to_cache()
	{
		if (!sessionStorage)
			return;
		sessionStorage.setItem('com_cache', div.innerHTML);
		sessionStorage.setItem('com_expires', now + 300);
	}

	var inflight = 0;
	var xhr = window.XDomainRequest && (function(url, cb) {
		var req = new XDomainRequest();
		req.open('GET',url);
		var drop = req.onerror = req.ontimeout = function() {
			if (!--inflight)
				setTimeout(save_to_cache, 1000);
		}
		req.onload = function() {
			cb(JSON.parse(req.responseText));
			drop();
		}
		inflight++;
		req.send();
	}) || (function(url, cb) {
		var req = new XMLHttpRequest();
		req.onreadystatechange = function(e) {
			if (req.readyState === 4) {
				if (req.status === 200)
					cb(JSON.parse(req.responseText));
				// We're done hammering? Cache result.
				if (!--inflight)
					setTimeout(save_to_cache, 1000);
			}
		}
		inflight++;
		req.open("GET", url, true);
		req.send(null);
	});

	// Make some readable timestamp.
	function mkago(t)
	{
		if (!t)
			return '';
		t |= 0;
		t = now - t;
		if (t < 0)
			return 'a moment ago';
		var min = (t/60)|0;
		var hour = (min/60)|0;
		var day = (hour/24)|0;
		if (day === 1) return 'a day ago';
		if (day) return day + ' days ago';
		if (hour === 1) return 'a hour ago';
		if (hour) return hour + ' hours ago';
		if (min === 1) return 'a minute ago';
		if (min) return min + ' minutes ago';
		return 'a moment ago';
	}

	var ta = document.createElement('textarea');
	function html_unescape(s)
	{
		ta.innerHTML = s;
		return ta.value;
	}

	function render_comment(target,t)
	{
		var elm = $.createElement('div');
		elm.className = 'comment';
		elm.innerHTML = '<div class=tagline>'
			+' <a href="'+t.user+'">'+t.author+'</a>'
		        +' <a href='+t.reply+'>'+mkago(t.time)+'</a>'
		        +' <a href="#" onclick="return com_collapse(this);'
			+'">[-]</a></div>';
		var elm2 = $.createElement('div');
		elm2.className = 'comment_body';
		elm2.innerHTML = t.text+'<a class="reply" href="'+t.reply
			+'">reply</a><br/>';
		elm.appendChild(elm2);
		target.appendChild(elm);
		return elm2;
	}

	// Render one node, potentially recurse into reddit_tree for replies.
	function reddit_node(target, cd)
	{
		var t = {}
		var tid = cd.link_id.split('_')[1];

		// Shown content.
		t.author = cd.author;
		t.time = cd.created_utc;
		t.text = html_unescape(cd.body_html);

		// Link values.
		t.user = reddit+'/user/'+cd.author;
		t.reply = reddit+'/r/'+cd.subreddit+'/comments/'+tid
			+'//'+cd.name.split('_')[1]

		reddit_tree(render_comment(target, t), cd.replies);
	}

	// Grab comment `tree`, parse, inject HTML into `target`.
	function reddit_tree(target, tree)
	{
		if (!tree || tree.kind !== 'Listing')
			return;

		var comments = tree.data.children;
		for (var i = 0; i < comments.length; i++) {
			var c = comments[i];
			if (c.kind != 't1')
				continue;
			reddit_node(target, c.data);
		}
	}

	// Issue reddit search request, pass results to reddit_tree.
	xhr(reddit_s + url, function(d) {
		var c = d.data.children;
		for (var i = 0; i < c.length; i++) {
			var t = c[i];
			if (t.kind !== 't3')
				continue;
			var threadu = reddit + '/r/' + t.data.subreddit
					+ '/comments/' + t.data.id;
			if (!i) $.getElementById('r_submit').href = threadu;
			threadu += '.json'
			var subdiv = $.createElement('div');
			reddit_div.appendChild(subdiv);
			// Block scope emulator 3000.
			(function(subdiv){
				xhr(threadu, function(s) {
					reddit_tree(subdiv, s[1]);
				});
			})(subdiv);
		}
	});

	function hn_node(target, node)
	{
		var t = {}
		if (!node.text) return;
		t.author = node.author;
		t.time = ((new Date(node.created_at)).getTime()/1000)|0;
		t.text = node.text;

		t.user = hn + '/user?id='+node.author;
		t.reply = hn + '/reply?id='+node.id;
		hn_tree(render_comment(target, t), node);

	}

	function hn_tree(target, tree)
	{
		if (!tree.children) return;
		for (var i = 0; i < tree.children.length; i++) {
			hn_node(target, tree.children[i]);
		}

	}

	// Issue HN search request
	xhr(hn_s + url, function(d) {
		var r = d.hits;
		for (var i = 0; i < r.length; i++) {
			var subdiv = $.createElement('div');
			if (!i) $.getElementById('hn_submit').href =
				hn + '/item?id='+r[i].objectID;
			hn_div.appendChild(subdiv);
			(function(subdiv){
				xhr(hn_i + r[i].objectID, function(tree) {
					hn_tree(subdiv, tree);
				});
			})(subdiv);
		}
	});
})(document);

function com_collapse(elm)
{
	var tohide = elm.parentNode.nextSibling;
	if (tohide.style.display === 'none') {
		elm.innerHTML = '[-]';
		tohide.style.display = 'block';
	} else {
		var count="";
	       	try { count = tohide.getElementsByClassName('comment').length+1;
		} catch(e) {};
		elm.innerHTML = '[+'+count+']';
		tohide.style.display = 'none';
	}
	return false;
}


