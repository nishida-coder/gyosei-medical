(function () {
    "use strict";

    function ready(fn) {
        if (document.readyState !== "loading") {
            fn();
        } else {
            document.addEventListener("DOMContentLoaded", fn);
        }
    }

    // Reorder single clinic page so the DOCTOR block appears right after the logo image.
    // IMPORTANT: #post_list2 is reused by the MEDIA section on the same page, so we must
    // distinguish the doctor block (has .cat-category tags) from media items (no tags).
    function reorderSingleClinic() {
        var article = document.getElementById("article");
        if (!article) return;
        var postImage = document.getElementById("post_image");
        if (!postImage) return;

        var movedElements = [];
        var seen = function (el) { return movedElements.indexOf(el) !== -1; };

        var children = Array.prototype.slice.call(article.children);

        // 1) DOCTOR heading div (direct child with <p>/<P> text === "DOCTOR")
        children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === "div" && !seen(child)) {
                var p = child.querySelector("p, P");
                if (p && p.textContent && p.textContent.trim() === "DOCTOR") {
                    movedElements.push(child);
                }
            }
        });

        // 2) <center> wrappers containing #post_list2 WITH .cat-category tags
        //    (these are the doctor portrait blocks; MEDIA items have no cat tags)
        function isDoctorCenter(center) {
            if (!center.querySelector("#post_list2")) return false;
            return !!center.querySelector(".cat-category, .cat-category2, .cat-category3");
        }

        var allCenters = article.querySelectorAll("center");
        Array.prototype.forEach.call(allCenters, function (center) {
            if (!seen(center) && isDoctorCenter(center)) {
                movedElements.push(center);
            }
        });

        // 3) Doctor detail div (contains "診療科" / "専門医" / "出身大学" / "大学")
        var detailKeywords = ["診療科", "専門医", "出身大学", "大学："];
        children.forEach(function (child) {
            if (!child.tagName || child.tagName.toLowerCase() !== "div" || seen(child)) return;
            var text = (child.textContent || "").replace(/\s+/g, "");
            if (text.length < 8 || text.length > 400) return;
            var hit = detailKeywords.some(function (kw) { return text.indexOf(kw) !== -1; });
            if (hit) movedElements.push(child);
        });

        if (movedElements.length === 0) return;

        // Insertion point: right after #post_image
        var anchor = postImage.nextSibling;
        movedElements.forEach(function (el) {
            article.insertBefore(el, anchor);
            anchor = el.nextSibling;
        });
    }

    // Per-clinic YouTube URL overrides. The site stores clinic content in TCD pagebuilder
    // meta fields, so patching specific SNS icon links is easier from the client side.
    var CLINIC_YOUTUBE = {
        "kokoromental": "https://www.youtube.com/watch?v=xCg6wNiL8BQ"
    };

    function patchClinicYouTube() {
        var slugMatch = window.location.pathname.match(/^\/([^/]+)\/?$/);
        if (!slugMatch) return;
        var slug = slugMatch[1];
        var url = CLINIC_YOUTUBE[slug];
        if (!url) return;

        // Find anchors whose image src ends with /3.png — these are the YouTube icons
        var anchors = document.querySelectorAll('a img[src*="/2024/06/3.png"]');
        Array.prototype.forEach.call(anchors, function (img) {
            var a = img.closest("a");
            if (!a) return;
            var current = (a.getAttribute("href") || "").trim();
            if (current === "" || current === "#") {
                a.setAttribute("href", url);
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener");
            }
        });
    }

    // Wrap each logical section (heading + following content) in alternating
    // white/beige containers. All section headings get a common class so CSS
    // can restyle them uniformly (they originally have inline #66B0C1 / Merriweather).
    function wrapArticleSections() {
        var article = document.getElementById("article");
        if (!article) return;

        // Run after reorderSingleClinic so DOCTOR block is already moved up.
        var children = Array.prototype.slice.call(article.children);

        // A "section heading" is a direct-child <div> whose first <p>/<P> has color #66B0C1
        // (TCD's inline style) OR that has the gm-media-heading tag we set elsewhere.
        function isSectionHeading(el) {
            if (!el || el.nodeType !== 1) return false;
            if (el.tagName !== "DIV") return false;
            if (el.classList && el.classList.contains("gm-section")) return false;
            var p = el.querySelector("p, P");
            if (!p) return false;
            var style = p.getAttribute("style") || "";
            if (style.indexOf("#66B0C1") !== -1) return true;
            if (el.classList && el.classList.contains("gm-media-heading")) return true;
            return false;
        }

        // Tag section headings with a common class so CSS can unify font + color
        children.forEach(function (el) {
            if (isSectionHeading(el)) {
                el.classList.add("gm-sect-heading");
            }
        });

        // Build sections: each section = one heading + all siblings until next heading.
        // Any children before the first heading go into a "lead" section.
        var sections = [];
        var current = null;
        children.forEach(function (el) {
            if (el.id === "article_header" || el.id === "post_image") return;
            if (isSectionHeading(el)) {
                current = { heading: el, members: [el] };
                sections.push(current);
            } else if (current) {
                current.members.push(el);
            } else {
                if (!sections.length || sections[0].heading) {
                    sections.unshift({ heading: null, members: [] });
                }
                sections[0].members.push(el);
            }
        });

        // Wrap each section in a div with alternating bg class.
        // Order for a clinic page (after reorderSingleClinic moves DOCTOR up):
        //   0 DOCTOR → BEIGE
        //   1 (catch) "全国トップクラス..." → WHITE
        //   2 WEB → BEIGE
        //   3 ACCESS → WHITE
        //   4 診療時間 → BEIGE
        //   5 電話番号 → WHITE
        //   6 MEDIA → BEIGE
        //   7 RELATED → WHITE
        // Section 0 = beige so the DOCTOR card reads as the primary block.
        sections.forEach(function (sec, idx) {
            if (!sec.members.length) return;
            var wrap = document.createElement("div");
            wrap.className = "gm-section " + (idx % 2 === 0 ? "gm-section-beige" : "gm-section-white");

            var first = sec.members[0];
            first.parentNode.insertBefore(wrap, first);
            sec.members.forEach(function (m) { wrap.appendChild(m); });
        });

        // Neutralize inline beige <section> backgrounds inside our wraps
        var innerSections = article.querySelectorAll(".gm-section section[style*='F3F2E9']");
        Array.prototype.forEach.call(innerSections, function (s) {
            s.setAttribute("data-gm-neutralized", "1");
        });

        // Tag MEDIA heading explicitly (used by CSS for any extras)
        var all = article.querySelectorAll(".gm-sect-heading p, .gm-sect-heading P");
        Array.prototype.forEach.call(all, function (p) {
            var txt = (p.textContent || "").trim();
            if (txt === "MEDIA") {
                p.closest(".gm-sect-heading").classList.add("gm-media-heading");
            }
        });
    }

    // Banner restructure is fully handled server-side via PHP
    // (`gyosei_force_https_rewrite` in functions.php). JS is a no-op to avoid
    // double-labelling (PHP already wrote gm-banner-label into each card).
    function restructureHomeBanners() {
        /* intentionally empty — PHP owns banner rewrite */
    }

    function relabelBanner(parent, imgMatch, title, subtitle) {
        var img = parent.querySelector('img[src*="' + imgMatch + '"]');
        if (!img) return;
        var card = img.closest
            ? img.closest(".gm-home-banner-item")
            : (function (el) {
                while (el && el.nodeType === 1 && !el.classList.contains("gm-home-banner-item")) el = el.parentNode;
                return el && el.nodeType === 1 ? el : null;
            })(img);
        if (!card) return;
        if (card.dataset && card.dataset.gmRelabeled === "1") return;

        // IMPORTANT: only remove TEXT elements that do NOT contain the banner image/link.
        // Browser auto-correction around TCD's malformed HTML can nest <img> inside <p>,
        // so naive removal of all <p> would drop the image too.
        var toRemove = [];
        var textLikeSelectors = "p, P, br, center";
        var all = card.querySelectorAll(textLikeSelectors);
        Array.prototype.forEach.call(all, function (el) {
            if (el.tagName === "BR") { toRemove.push(el); return; }
            if (!el.querySelector("img, a")) toRemove.push(el);
        });
        toRemove.forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });

        // Append clean label block below the image
        var label = document.createElement("div");
        label.className = "gm-banner-label";
        label.innerHTML =
            '<span class="gm-banner-title">' + escapeHtml(title) + "</span>" +
            '<span class="gm-banner-sub">' + escapeHtml(subtitle) + "</span>";
        card.appendChild(label);
        if (card.dataset) card.dataset.gmRelabeled = "1";
    }

    // Archive / category / search pages: enrich each clinic card with doctor photo + name + grad year
    // by fetching the linked clinic page in parallel and extracting the data.
    function enrichArchiveCards() {
        // Never run on single clinic pages (they have #post_list2 too, but that's the doctor block)
        if (document.body.classList.contains("single")) return;

        var path = window.location.pathname;
        var isArchive = /^\/(category|category2|category3|clinic)(\/|$)/.test(path) ||
                        document.body.classList.contains("archive");
        if (!isArchive) return;

        // Both #post_list (category archive) and #post_list2 (search results) are used
        var items = document.querySelectorAll(
            "#post_list li.article, #post_list2 li.article, " +
            "#main_col #post_list > li.article, #main_col #post_list2 > li.article"
        );
        if (!items.length) return;

        Array.prototype.forEach.call(items, function (li) {
            var anchor = li.querySelector("a[href]");
            if (!anchor) return;
            var url = anchor.getAttribute("href") || "";
            if (!url) return;
            if (url.indexOf("http") !== 0 && url.charAt(0) === "/") {
                url = window.location.origin + url;
            }
            if (url.indexOf("http") !== 0) return;

            // sessionStorage cache to avoid repeated fetches
            var cacheKey = "gm_doctor_" + url;
            var cached = null;
            try { cached = sessionStorage.getItem(cacheKey); } catch (e) {}

            function apply(data) {
                if (!data) return;
                li.classList.add("gm-archive-enriched-card");

                var imageDiv = li.querySelector(".image");
                if (imageDiv && data.photo) {
                    var img = imageDiv.querySelector("img");
                    if (img) {
                        img.setAttribute("src", data.photo);
                        img.removeAttribute("srcset");
                        img.removeAttribute("data-lazy");
                        img.removeAttribute("width");
                        img.removeAttribute("height");
                        img.style.borderRadius = "50%";
                        img.style.padding = "0";
                        img.style.objectFit = "cover";
                    }
                    imageDiv.classList.add("gm-archive-doctor");
                }

                var title = li.querySelector(".title");
                var clinicName = title ? (title.textContent || "").trim() : "";
                if (title) {
                    // Doctor name + grad + clinic name. Specialty is NOT repeated here —
                    // it's already shown in the ul.meta tag pill (avoid duplicate "内科").
                    title.innerHTML =
                        (data.doctor ? '<span class="gm-archive-doctor-name">' + escapeHtml(data.doctor) +
                            (data.grad ? '<span class="gm-archive-grad">（' + escapeHtml(data.grad) + '）</span>' : "") +
                            "</span>" : "") +
                        (clinicName ? '<span class="gm-archive-clinic">' + escapeHtml(clinicName) + "</span>" : "");
                    title.classList.add("gm-archive-enriched");
                }
            }

            if (cached) {
                try { apply(JSON.parse(cached)); } catch (e) {}
                return;
            }

            fetch(url, { credentials: "same-origin" })
                .then(function (r) { return r.ok ? r.text() : ""; })
                .then(function (html) {
                    if (!html) return;
                    var doc = new DOMParser().parseFromString(html, "text/html");
                    var data = extractDoctorData(doc);
                    if (data) {
                        try { sessionStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
                        apply(data);
                    }
                })
                .catch(function () {});
        });
    }

    function extractDoctorData(doc) {
        var out = { photo: null, doctor: null, grad: null, specialty: null };

        // Single clinic page has post_list2 used BOTH for doctor block (first) and media (later).
        // Doctor block is identified by having .cat-category inside.
        var allPostList2 = doc.querySelectorAll("#post_list2, ol#post_list2");
        var doctorOl = null;
        Array.prototype.forEach.call(allPostList2, function (ol) {
            if (!doctorOl && ol.querySelector(".cat-category")) {
                doctorOl = ol;
            }
        });
        if (!doctorOl && allPostList2.length) doctorOl = allPostList2[0];

        if (doctorOl) {
            // Doctor photo: first <img> with .wp-post-image or anything in .image
            var photoImg =
                doctorOl.querySelector(".image img") ||
                doctorOl.querySelector("img[src*='scaled']") ||
                doctorOl.querySelector("img.wp-post-image") ||
                doctorOl.querySelector("img");
            if (photoImg) {
                out.photo = photoImg.getAttribute("src") ||
                            photoImg.getAttribute("data-src") ||
                            photoImg.getAttribute("data-lazy");
            }

            // Doctor name + grad year from the first <p> that contains a <strong>
            var nameP = doctorOl.querySelector(".wp-block-column p strong, .wp-block-column p.title strong");
            if (nameP) {
                var raw = (nameP.innerHTML || nameP.textContent || "")
                    .replace(/<br\s*\/?>/gi, "|")
                    .replace(/<[^>]+>/g, "");
                var parts = raw.split("|").map(function (s) { return s.trim(); }).filter(Boolean);
                if (parts.length >= 1) out.doctor = parts[0];
                if (parts.length >= 2) {
                    var m = parts[1].match(/\(?(\d{2,4}[^)）]*卒)\)?/);
                    if (m) out.grad = m[1];
                    else out.grad = parts[1].replace(/[()（）]/g, "");
                }
            }

            // Specialty from first cat-category inside doctor block
            var catEl = doctorOl.querySelector(".cat-category");
            if (catEl) out.specialty = (catEl.textContent || "").trim();
        }

        // Fallback: specialty from #post_meta_top anywhere
        if (!out.specialty) {
            var fallbackCat = doc.querySelector("#post_meta_top .cat-category, .meta .cat-category");
            if (fallbackCat) out.specialty = (fallbackCat.textContent || "").trim();
        }

        return out;
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // Parent theme JS sets .inview-fadein{opacity:0} and then animates in — that delays
    // the hero caption. Force caption visible immediately and keep it visible.
    function forceHeroVisible() {
        var selectors = [
            "#header_slider",
            "#header_slider .item",
            "#header_slider .slick-slide",
            "#header_slider .caption",
            "#header_slider .caption .headline",
            "#header_slider .caption .catchphrase"
        ];
        selectors.forEach(function (sel) {
            var els = document.querySelectorAll(sel);
            Array.prototype.forEach.call(els, function (el) {
                el.style.opacity = "1";
                el.style.visibility = "visible";
            });
        });
    }

    // TCD's jquery.textOverflowEllipsis.js plugin strips <br> content out of
    // .title.js-ellipsis and replaces innerHTML with truncated text, keeping the
    // original in a data-original attribute. For #post_list clinic cards we NEED
    // the full name + "(08年卒)" line — so restore from data-original and strip
    // the js-ellipsis hook class.
    function restoreTitleText() {
        var titles = document.querySelectorAll("#post_list .article p.title, #post_list .article h2.title, #post_list .article h3.title");
        Array.prototype.forEach.call(titles, function (p) {
            var orig = p.getAttribute("data-original");
            if (orig && (!p.innerHTML || p.innerHTML.length < orig.length)) {
                p.innerHTML = orig;
            }
            p.classList.remove("js-ellipsis");
            p.style.whiteSpace = "normal";
            p.style.textOverflow = "clip";
            p.style.overflow = "visible";
            p.style.maxHeight = "none";
            p.style.webkitLineClamp = "unset";
        });
    }

    // Defensive wrapper so a single failing step doesn't kill every later step.
    function safeRun(name, fn) {
        try { fn(); } catch (e) {
            if (window.console && console.warn) {
                console.warn("[gyosei-brushup] " + name + " failed:", e);
            }
        }
    }

    ready(function () {
        safeRun("forceHeroVisible", forceHeroVisible);
        setTimeout(function () { safeRun("forceHeroVisible", forceHeroVisible); }, 0);
        setTimeout(function () { safeRun("forceHeroVisible", forceHeroVisible); }, 100);
        setTimeout(function () { safeRun("forceHeroVisible", forceHeroVisible); }, 500);

        safeRun("reorderSingleClinic", reorderSingleClinic);
        safeRun("wrapArticleSections", wrapArticleSections);
        safeRun("patchClinicYouTube", patchClinicYouTube);
        safeRun("restructureHomeBanners", restructureHomeBanners);
        safeRun("enrichArchiveCards", enrichArchiveCards);
        safeRun("restoreTitleText", restoreTitleText);

        setTimeout(function () { safeRun("restoreTitleText", restoreTitleText); }, 100);
        setTimeout(function () { safeRun("restoreTitleText", restoreTitleText); }, 500);
        setTimeout(function () { safeRun("restoreTitleText", restoreTitleText); }, 1500);
        setTimeout(function () { safeRun("restoreTitleText", restoreTitleText); }, 3000);
        window.addEventListener("resize", function () {
            setTimeout(function () { safeRun("restoreTitleText", restoreTitleText); }, 50);
        });

        // Expose for manual debugging
        window.gmBrushup = {
            restoreTitleText: restoreTitleText,
            enrichArchiveCards: enrichArchiveCards,
            restructureHomeBanners: restructureHomeBanners,
            wrapArticleSections: wrapArticleSections,
            reorderSingleClinic: reorderSingleClinic,
        };

        var targets = document.querySelectorAll(
            "#post_list .article, #main_contents h2, #main_contents h3, .widget, #post_list2 .article"
        );
        targets.forEach(function (el) {
            el.classList.add("gm-reveal");
        });

        if (!("IntersectionObserver" in window)) {
            targets.forEach(function (el) { el.classList.add("is-in"); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-in");
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        targets.forEach(function (el) { io.observe(el); });
    });
})();
