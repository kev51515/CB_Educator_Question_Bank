-- =============================================================================
-- Migration: 0170_seed_cb_og_7.sql
-- Purpose:   Seed "CB OG #7" (College Board linear Digital SAT practice test,
--            66 RW + 54 Math = 120 Q) into the full-test tables from 0048.
--   Source:  sat-practice-test-7-digital.pdf; official College Board answer key (pdf/Key/).
--   Idempotent upsert on (slug)/(test_id,position)/(module_id,position).
-- =============================================================================
DO $seed$
DECLARE v_test uuid; v_mod uuid;
BEGIN
  INSERT INTO public.tests (slug, ordinal, title, short_title, source, total_questions)
  VALUES ('cb-og-7', 13, 'CB OG #7', 'CB OG #7', 'sat-practice-test-7-digital.pdf', 120)
  ON CONFLICT (slug) DO UPDATE SET ordinal=EXCLUDED.ordinal, title=EXCLUDED.title,
    short_title=EXCLUDED.short_title, source=EXCLUDED.source, total_questions=EXCLUDED.total_questions
  RETURNING id INTO v_test;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 1, 'reading-writing', 'Reading and Writing — Module 1', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '1-1', 1, 'mcq', 'On the basis of extensive calculations and models, astronomers in the 1990s predicted that the collision of two neutron stars or a neutron star and a black hole could release a massive burst of gamma rays in an event called a kilonova. This ______ was confirmed with observations in 2017.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"theory","B":"evidence","C":"constant","D":"experiment"}'::jsonb, NULL, 'A', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '1-2', 2, 'mcq', 'The following text is from John Muir''s 1913 autobiography The Story of My Boyhood and Youth. Muir describes being on a boat.

The water was so clear that it was almost invisible, and when we floated slowly out over the plants and fishes, we seemed to be miraculously sustained in the air while exploring a veritable fairyland.', NULL, 'As used in the text, what does the word “clear” most nearly mean?', '{"A":"Simple","B":"Understandable","C":"Obvious","D":"Transparent"}'::jsonb, NULL, 'D', NULL, NULL, 4)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '1-3', 3, 'mcq', 'At the turn of the twentieth century, Black residents of Richmond, Virginia, had few formal options for banking and other financial services. To ______ this situation, Maggie Lena Walker chartered the St. Luke Penny Savings Bank in 1903. The bank went on to provide home loans and savings opportunities to thousands of Black families over the following decades.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"prolong","B":"rectify","C":"retain","D":"highlight"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '1-4', 4, 'mcq', 'The results of randomized clinical trials testing the efficacy of common medical interventions sometimes fail to ______ conclusions that practitioners reach based on their real-world observations of patients. While there are several possible reasons for this, one is that practitioners may overlook confounding variables that account for the results they attribute to the interventions in question.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"circumvent","B":"corroborate","C":"disseminate","D":"implement"}'::jsonb, NULL, 'B', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '1-5', 5, 'mcq', 'Diadromous fish migrate between freshwater and marine biomes during their life cycle. The migration''s obligate nature is why diadromous fish can be ______ those that are merely euryhaline (able to tolerate high salinity): the euryhaline blackchin tilapia can survive high salinity, but its life cycle does not involve relocation to a different biome, as does that of the diadromous wild salmon.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"demarcated from","B":"reconstituted as","C":"conflated with","D":"derived from"}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '1-6', 6, 'mcq', 'The following text is from Joan Didion''s memoir The Year of Magical Thinking. In the text, the author discusses her home life.

[I]n California we heated our houses by building fires. We built fires even on summer evenings, because the fog came in. <u>Fires said we were home, we had drawn the circle, we were safe through the night.</u>', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It illustrates that a fire provides comfort beyond physical warmth.","B":"It summarizes the information that came before it in the text.","C":"It explains that the house remains cold even in summer.","D":"It suggests that the author feels comfortable in her home with or without a fire."}'::jsonb, NULL, 'A', NULL, NULL, 5)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '1-7', 7, 'mcq', 'The majority of plastics today wind up in landfills or are, at best, recycled into materials that have a very limited range of applications. To address this problem, chemist Guoliang Liu and colleagues designed a reactor that melts polyethylene and polypropylene—two widely used plastics—into a wax. The wax can then be transformed into <u>a surfactant (a chemical compound usable as a detergent)</u>. With this promising new method, plastic waste could be turned into a range of useful cleaning products.', NULL, 'Which choice best states the function of the underlined portion of the text?', '{"A":"It clarifies the meaning of a scientific term.","B":"It describes an environmental concern.","C":"It explains the significance of a scientific discovery.","D":"It identifies a result that confused the team."}'::jsonb, NULL, 'A', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '1-8', 8, 'mcq', 'The following text is from H.D.''s 1916 poem “Mid-Day.” In the poem, the speaker is on a path in an outdoor setting.

<u>A slight wind shakes the seed-pods—</u>
my thoughts are spent
as the black seeds.
My thoughts tear me,
I dread their fever.
I am scattered in its whirl.
I am scattered like
the hot shrivelled seeds.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It illustrates a change in the natural environment that the speaker implies is responsible for the growing misgivings described in the text.","B":"It establishes an example of consistency in the natural landscape that the speaker then contrasts with the unpredictability of human emotions.","C":"It presents an observation of an occurrence in the natural world that the speaker then expands on to convey a sense of a turbulent interior state.","D":"It evokes the ordinariness of an event in nature to suggest that the critical self-evaluation the speaker engages in is a common pursuit."}'::jsonb, NULL, 'C', NULL, NULL, 6)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '1-9', 9, 'mcq', 'In 2023 literary scholar Jeremy Douglass cautioned technology investors and enthusiasts who predict conventional books'' ultimate displacement by newer forms of media. <u>Douglass observed that the concept of an “interactive” text is much older than technologists assume, extending back to the first time readers scratched notes into a text''s margins.</u> In addition, newer media, such as video games, haven''t replaced older forms of entertainment, such as comic books, but rather exist alongside them. Douglass believes that rather than supplanting books, technology is simply making new forms of expression possible.', NULL, 'Which choice best describes the function of the underlined portion in the text as a whole?', '{"A":"It challenges the stance of the investors and enthusiasts who are mentioned earlier in the text.","B":"It explains the basis for the claim made by the technologists mentioned in the text.","C":"It suggests that academics are better suited than investors to see the potential uses of contemporary interactive texts.","D":"It provides a historical anecdote about the technological challenges involved in reading the earliest interactive texts."}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '1-10', 10, 'mcq', 'In 2018, scientists discovered an immense aggregation of Muusoctopus robustus (pearl octopuses) along a hydrothermal vent 3,200 meters beneath the ocean''s surface. Water temperatures at this site—named the Octopus Garden—climb as high as 11°C, much warmer than the ambient 1.6°C typical at this depth. Based on observations made over three years, scientists concluded that temperatures at the site likely confer reproductive benefits and that the site is used exclusively for reproduction—6,000 M. robustus adults, hatchlings, and eggs were observed at the garden, but no juveniles were present.', NULL, 'Which statement about M. robustus and the Octopus Garden is best supported by the text?', '{"A":"M. robustus leave the Octopus Garden upon reaching an intermediary stage of development.","B":"The M. robustus population at the Octopus Garden remains stable despite variations in water temperature.","C":"M. robustus nests in the Octopus Garden contain on average fewer but larger eggs than nests at similar ocean depths.","D":"The Octopus Garden provides an ideal feeding ground for M. robustus hatchlings."}'::jsonb, NULL, 'A', NULL, NULL, 7)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '1-11', 11, 'mcq', 'The following text is from Thomas Mann''s 1924 novel The Magic Mountain, translated by John E. Woods in 1995.

The story of Hans Castorp that we intend to tell here—not for his sake (for the reader will come to know him as a perfectly ordinary, if engaging young man), but for the sake of the story itself, which seems to us to be very much worth telling (although in Hans Castorp''s favor it should be noted that it is his story, and that not every story happens to everybody)—is a story that took place long ago, and is, so to speak, covered with the patina of history and must necessarily be told with verbs whose tense is that of the deepest past.', NULL, 'What does the text most strongly suggest about the story of Hans Castorp?', '{"A":"Though it is true that stories of even the most uninteresting people are themselves interesting because all people are unique, the reason this story is interesting is nonetheless difficult to understand because of the passage of time.","B":"Even though it is a story of a person of no particular importance, its age and the manner in which it therefore must be told are both indicators that the story itself is important.","C":"Like all stories about the lives of inconsequential people, this story must necessarily be related in a particular way if the reason the story is consequential is to be made evident to the audience.","D":"It is a remarkable story that happened to an unremarkable person, though one could plausibly argue that because the story is valuable, some of its value accrues to the person at its center."}'::jsonb, NULL, 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '1-12', 12, 'mcq', '[Bar graph titled “Percentage of Participants Who Mentioned Factors.” The horizontal axis is labeled “Factor” and shows three factors: convenience, costs, and established behaviors. The vertical axis is labeled “Percent” and ranges from 0 to 80. Approximate values: convenience about 95%, costs about 25%, established behaviors about 50%.]

Researcher Judith Hilton and her team interviewed 55 people about which factors would make them switch from using single-use plastic containers to reusable containers. The graph shows three of the factors mentioned in the interviews and the percentage of participants who mentioned them.', 'Bar graph: “Percentage of Participants Who Mentioned Factors.” X-axis “Factor” with bars for convenience, costs, and established behaviors; Y-axis “Percent” 0–80.', 'According to the graph, about what percentage of participants mentioned costs in the interviews?', '{"A":"10%","B":"95%","C":"25%","D":"50%"}'::jsonb, '/data/tests/cb-og-7/figures/m1-q12.png', 'D', NULL, NULL, 8)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '1-13', 13, 'mcq', 'A student in a political science course is writing a paper on Aristotle''s The Politics, in which Aristotle offers his opinion on political instability and gives advice on how constitutions can be preserved. Aristotle observes that different forms of government can fall in different ways—for example, oligarchies might grant power to military leaders during wartime who refuse to relinquish that power during peacetime—but some methods of preserving order apply across all forms of government. The student claims that in particular Aristotle asserts that in a healthy state obedience to law must be as close to absolute as possible and that even minor infractions should not be ignored.', NULL, 'Which quotation from a philosopher''s analysis of The Politics would best support the student''s claim?', '{"A":"“When constructing his argument regarding the characteristics of a well-functioning government, Aristotle asserts that ‘Transgression creeps in unperceived and at last ruins the state,’ illustrating this idea with a comparison to frequent small expenditures slowly and almost imperceptibly chipping away at a fortune until it is ultimately depleted.”","B":"“When Aristotle writes on the necessity of avoiding corruption in government, he proposes that ‘every state should be so administered and so regulated by law that its magistrates cannot possibly make money.’ In particular, he thinks oligarchies are particularly susceptible to corruption through bribery.”","C":"“When Aristotle considers the health of constitutions, he states that ‘Constitutions are preserved when their destroyers are at a distance, and sometimes also because they are near, for the fear of them makes the government keep in hand the constitution.’ He holds that rulers who wish to see constitutions preserved must continually remind the populace of the dangers that would result from a constitutional collapse.”","D":"“When contrasting different forms of government, Aristotle holds that ‘oligarchies may last, not from any inherent stability in such forms of government, but because the rulers are on good terms both with the unenfranchised and with the governing classes.’ That is, oligarchic leaders who wish to hold on to power will introduce members of disenfranchised classes into government in a participatory role.”"}'::jsonb, NULL, 'A', NULL, NULL, 9)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '1-14', 14, 'mcq', 'Almost all works of fiction contain references to the progression of time, including the time of day when events in a story take place. In a 2020 study, Allen Kim, Charuta Pethe, and Steven Skiena claim that an observable pattern in such references reflects a shift in human behavior prompted by the spread of electric lighting in the late nineteenth century. The researchers drew this conclusion from an analysis of more than 50,000 novels spanning many centuries and cultures, using software to recognize and tally both specific time references—that is, clock phrases, such as 7 a.m. or 2:30 p.m.—and implied ones, such as mentions of meals typically associated with a particular time of day.', NULL, 'Which finding from the study, if true, would most directly support the researchers'' conclusion?', '{"A":"Novels published after the year 1800 include the clock phrase 10 a.m. less often than novels published before the year 1800 do.","B":"Novels published after 1880 contain significantly more references to activities occurring after 10 p.m. than do novels from earlier periods.","C":"Among novels published in the nineteenth century, implied time references become steadily more common than clock phrases as publication dates approach 1900.","D":"The time references of noon (12 p.m.) and midnight (12 a.m.) are used with roughly the same frequency in the novels."}'::jsonb, NULL, 'B', NULL, NULL, 10)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '1-15', 15, 'mcq', '[Bar graph titled “Percentage of ULE Attributed to Population Growth and GDP per Capita Growth in Two World Regions.” The horizontal axis is labeled “Region, time period” and shows four groups: Region 1 (1970–2000), Region 1 (2000–2014), Region 2 (1970–2000), and Region 2 (2000–2014). The vertical axis is labeled “Percentage attribution” and ranges from 0 to 90. Each group has two bars: urban population growth and GDP per capita growth.]

In a study of urban physical expansion, Richa Mahtta et al. conducted a meta-analysis of more than 300 cities worldwide to determine whether urban land expansion (ULE) was more strongly influenced by urban population growth or by growth in gross domestic product (GDP) per capita, a measure of economic activity. Because efficient national government is necessary to provide urban services and infrastructure that attract economic investment, Mahtta et al. propose that absent other factors, the importance of GDP per capita growth to ULE would likely increase relative to the importance of population growth as governments become more efficient. If true, this suggests the possibility that ______', 'Bar graph: “Percentage of ULE Attributed to Population Growth and GDP per Capita Growth in Two World Regions.” Grouped bars (urban population growth, GDP per capita growth) for Region 1 and Region 2 across 1970–2000 and 2000–2014; Y-axis “Percentage attribution” 0–90.', 'Which choice most effectively uses data from the graph to complete the statement?', '{"A":"national governments of countries in Region 1 experienced declines in efficiency in the period from 2000 to 2014, relative to the period from 1970 to 2000.","B":"countries in Region 1 experienced a slower rate of economic growth in the period from 2000 to 2014 than countries in Region 2 did, despite increasing national government efficiency in Region 1.","C":"national governments of most countries in Region 2 became more efficient in the period from 2000 to 2014 than they had been in the period from 1970 to 2000, but those of several countries in this region did not.","D":"national governments of countries in Region 1 and in Region 2 generally became more efficient in the period from 2000 to 2014 than they had been in the period from 1970 to 2000, but at different rates."}'::jsonb, '/data/tests/cb-og-7/figures/m1-q15.png', 'A', NULL, NULL, 11)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '1-16', 16, 'mcq', '[Bar graph titled “China''s Imports by Type, 2000–2006.” The horizontal axis is labeled “Import types” and shows three categories: ordinary imports, processing with assembly, and processing with inputs. The vertical axis is labeled “Imports (in hundreds of millions of dollars)” and ranges from 0 to 3,500. Each category has three bars for the years 2000, 2003, and 2006.]

A student is researching the Chinese government''s 1992 shift to a market economy that emphasizes trade liberalization. One means of trade liberalization involves expanding from ordinary imports into an emphasis on processing imports, which have two types: processing with assembly (in which a firm obtains raw materials from a foreign trading partner without payment and sells the final goods to that partner, charging for assembly) and processing with inputs (in which a firm expends capital to buy raw materials from a trading partner, processes them into final goods, and sells those goods to whichever trading partner it chooses). The student asserts that while initial efforts at trade liberalization were shaped by Chinese firms'' limited capital, this situation resolved during the 2000s.', 'Bar graph: “China''s Imports by Type, 2000–2006.” Grouped bars by year (2000, 2003, 2006) for ordinary imports, processing with assembly, and processing with inputs; Y-axis “Imports (in hundreds of millions of dollars)” 0–3,500.', 'Which choice best describes data from the graph that support the student''s assertion?', '{"A":"Processing imports with inputs were greater than both ordinary imports and processing imports with assembly in 2006.","B":"From 2000 to 2006, processing imports with inputs rose much more sharply than processing imports with assembly did.","C":"From 2000 to 2006, neither processing imports with inputs nor processing imports with assembly were greater than ordinary imports.","D":"Processing imports with assembly were greater in 2006 than processing imports with inputs in 2000."}'::jsonb, '/data/tests/cb-og-7/figures/m1-q16.png', 'B', NULL, NULL, 12)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '1-17', 17, 'mcq', 'Narwhals are shy whales that live in the remote Arctic Ocean. Some of them have a long tusk, like a unicorn horn, with sensitive nerves. Narwhals are known for this tusk, but many actually don''t have one and its purpose is unknown. One group of scientists came up with a possible purpose in 2014. The scientists suggested that the tusk may help narwhals determine when water around them is likely to start freezing and become dangerous for them. Marine biologist Kristin Laidre disagrees with that idea, though. She reasons that if the narwhal''s tusk serves such an important purpose, then it''s most likely that ______', NULL, 'Which choice most logically completes the text?', '{"A":"some narwhals would seek a new habitat.","B":"fewer marine animals would also have tusks.","C":"more narwhals would have a tusk.","D":"narwhals would become less shy over time."}'::jsonb, NULL, 'C', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '1-18', 18, 'mcq', 'To address the susceptibility of materials used in components of high-performance machinery, such as aircraft engines, to creep (deformation that is induced by persistent mechanical stress and that often occurs at elevated temperatures), materials researchers have developed silicon carbide (SiC) fibers for producing aerospace composites. Testing the thermomechanical properties of several commercially available SiC fibers, Ramakrishna T. Bhatt et al. found that in comparison with two polymer-derived SiC fibers, a nitrogen-treated SiC fiber exhibited a lower minimum creep rate, a measure of the rate at which a stress-exposed material deforms at a constant temperature and uniaxial load. The finding suggests that ______', NULL, 'Which choice most logically completes the text?', '{"A":"unlike the two polymer-derived SiC fibers, the nitrogen-treated SiC fiber can substantially inhibit creep, provided that temperatures and loads are consistent.","B":"the two polymer-derived SiC fibers likely hold similar potential for reducing the creep resistance of materials exposed to stress and elevated temperatures, thus prolonging the life span of aerospace machinery.","C":"composites based on the two polymer-derived SiC fibers have chemical properties that may improve the mechanical and thermal stability of aerospace equipment to a greater extent than do composites based on the nitrogen-treated SiC fiber.","D":"aerospace composites containing the nitrogen-treated SiC fiber may have the ability to withstand mechanical stress for a longer period of time than can aerospace composites containing either of the two polymer-derived SiC fibers."}'::jsonb, NULL, 'D', NULL, NULL, 13)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '1-19', 19, 'mcq', 'One of the earliest known maps is a Babylonian clay tablet thought to be almost 4,500 years old. The map ______ the area of a plot of land, shows a river valley, and includes the cardinal directions.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"describes","B":"describe","C":"have described","D":"are describing"}'::jsonb, NULL, 'A', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '1-20', 20, 'mcq', 'Eighteen letters written by Louisa May Alcott, author of the popular novel Little Women (1868), can be found at the New York Historical Society. ______ letters demonstrate Alcott''s keen business sense in her interactions with publishers.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"One","B":"That","C":"This","D":"These"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '1-21', 21, 'mcq', 'The Dust Bowl was a period of severe drought that plagued the Great Plains of the US during the 1930s. During this time, dust storms ______ over 100 million acres of land. They even reached as far east as New York City.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"are affecting","B":"will have affected","C":"will affect","D":"affected"}'::jsonb, NULL, 'D', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '1-22', 22, 'mcq', 'Many mechanical calculators were powered by a notched cylinder mechanism called the Leibniz wheel. Leibniz wheel calculators were popular in the first half of the twentieth ______ these ingenious devices were eventually replaced by electronic calculators.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"century","B":"century,","C":"century, but","D":"century that"}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '1-23', 23, 'mcq', 'Featuring jagged peaks of black ink surrounded by hazy swirls of blue and green paint, Zhang Daqian''s 1983 painting Panorama of Mount Lu is inspired by the tradition of qinglü shanshui, a type of Chinese landscape painting ______ by the use of blue and green hues to depict ethereal, otherworldly landscapes.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"has been characterized","B":"will be characterized","C":"characterized","D":"is characterized"}'::jsonb, NULL, 'C', NULL, NULL, 14)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '1-24', 24, 'mcq', 'Increasing the heat on an uncovered boiling pot of water does not increase the temperature of the water. What increases is the rate at which the water turns to ______ a pressure cooker pot, though, an airtight seal traps the vapor in the pot, creating pressure that allows the temperature of the water to increase past its boiling point.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"vapor. With","B":"vapor with","C":"vapor, with","D":"vapor and with"}'::jsonb, NULL, 'A', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '1-25', 25, 'mcq', 'Wanting to celebrate the 100th anniversary of the Alaska Purchase, ______ up with a motto that best captured the state''s unique character. The commission selected “North to the Future,” submitted by Juneau journalist Richard Peter, as its winning entry.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"a contest sponsored by the Alaska Centennial Commission would award $300 to an individual who came","B":"an award of $300 would go to an individual in a contest sponsored by the Alaska Centennial Commission for coming","C":"$300 would be awarded to an individual by the Alaska Centennial Commission in a contest for coming","D":"the Alaska Centennial Commission sponsored a contest that would award $300 to an individual who came"}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '1-26', 26, 'mcq', 'Recently unearthed Neronian tools in France dating to 54,000 years ago and attributed to Homo sapiens may provide evidence that interactions between Neanderthals and modern humans occurred 10,000 years earlier than was previously ______ finding that, if true, would overturn current theories about H. sapiens migration during the Upper Paleolithic.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"supposed; a","B":"supposed. A","C":"supposed a","D":"supposed, a"}'::jsonb, NULL, 'D', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '1-27', 27, 'mcq', 'Guard cells are specialized cells that are part of a plant''s pores. These cells help regulate the amount of carbon dioxide a plant takes in. ______ they help regulate a plant''s water loss.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Additionally,","B":"Previously,","C":"In conclusion,","D":"Instead,"}'::jsonb, NULL, 'A', NULL, NULL, 15)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '1-28', 28, 'mcq', 'While researching a topic, a student has taken the following notes:
• Angana Chaudhuri is a scientist.
• Chaudhuri studies sedimentary rocks.
• A scientist who studies sedimentary rocks is called a sedimentologist.
• Shale, chalk, and sandstone are examples of sedimentary rocks.

The student wants to identify what type of scientist Chaudhuri is.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Chalk is a type of sedimentary rock.","B":"Some scientists study shale, chalk, and sandstone.","C":"There are scientists who study sedimentary rocks.","D":"Chaudhuri is a sedimentologist."}'::jsonb, NULL, 'D', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '1-29', 29, 'mcq', 'While researching a topic, a student has taken the following notes:
• “Raymond''s Run” is a short story.
• It was written by African American author Toni Cade Bambara.
• It was first published in her book Gorilla, My Love in 1972.
• It is told from a first person perspective.
• It takes place in Harlem.

The student wants to indicate where the short story takes place.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"“Raymond''s Run” takes place in Harlem.","B":"“Raymond''s Run” was published in Gorilla, My Love.","C":"“Raymond''s Run” is told from a first person perspective.","D":"“Raymond''s Run” was written by Toni Cade Bambara."}'::jsonb, NULL, 'A', NULL, NULL, 16)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '1-30', 30, 'mcq', 'While researching a topic, a student has taken the following notes:
• The Royal Alcázar of Seville is a historic royal palace in Andalucía, Spain.
• The palace is famous for its intricate tilework.
• The palace features majolica and arista tiles.
• In the majolica style, designs are painted directly on the ceramic tiles.
• In the arista style, designs are stamped into the ceramic tiles.

The student wants to contrast the two styles of tiles.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Tiles in the majolica and arista styles can be found in the Royal Alcázar of Seville in Andalucía, Spain.","B":"Featuring tiles in the majolica and arista styles, the Royal Alcázar of Seville in Spain is famous for its intricate tilework.","C":"In the arista style, designs are stamped into the ceramic tiles, whereas in the majolica style, the designs are painted directly on them.","D":"Among the famous tilework of the Royal Alcázar of Seville are majolica style tiles, made by painting designs directly on the ceramic tiles."}'::jsonb, NULL, 'C', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '1-31', 31, 'mcq', 'While researching a topic, a student has taken the following notes:
• Musicians around the world have used protest songs to raise awareness about human rights violations.
• US folk singer Aunt Molly Jackson released the protest song “Poor Miner''s Farewell” in 1932.
• It exposed the unlivable wages and dangerous working conditions coal miners faced in Kentucky during the 1920s and 1930s.
• South African singer-songwriter Hugh Masekela released the protest song “Bring Him Back Home” in 1987.
• It called on the South African government to free Nelson Mandela, an anti-apartheid leader who''d been unjustly imprisoned.

The student wants to contrast the song “Poor Miner''s Farewell” with the song “Bring Him Back Home.”', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The songs “Poor Miner''s Farewell” and “Bring Him Back Home” both raised awareness about human rights violations.","B":"While both are protest songs, “Poor Miner''s Farewell” is about coal miners in Kentucky, whereas “Bring Him Back Home” is about the anti-apartheid leader Nelson Mandela.","C":"Hugh Masekela''s song “Bring Him Back Home,” released in 1987, called on the South African government to free Nelson Mandela.","D":"Released in 1932 by Aunt Molly Jackson, the song “Poor Miner''s Farewell” was a protest against the unlivable wages and dangerous working conditions faced by Kentucky coal miners."}'::jsonb, NULL, 'B', NULL, NULL, 17)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '1-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Political scientist Graham Allison is known for his Thucydides trap theory.
• Allison''s theory states that whenever “a rising power is threatening to displace a ruling power,” conflict is likely.
• The theory is based on Thucydides''s explanation of the conflict between Athens and Sparta.
• Thucydides wrote that “the rise of Athens and the fear this instilled in Sparta” made conflict “inevitable.”
• History professor Edmund Stewart recently challenged the historical basis of the theory.
• Stewart claimed that Athens was not a rising power and that the rivals experienced a “clash of cultures” instead.

The student wants to use a quotation to challenge Thucydides''s explanation of the conflict between Athens and Sparta.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"According to Allison''s Thucydides trap theory, whenever “a rising power is threatening to displace a ruling power,” conflict is likely.","B":"Thucydides wrote that conflict between the two powers was “inevitable,” although Stewart later challenged the historical basis of this claim.","C":"According to Stewart, a “clash of cultures” between Athens and Sparta caused the conflict, not Athens''s rise.","D":"Thucydides explained that conflict was caused by “the rise of Athens and the fear this instilled in Sparta,” but Allison disagreed, seeing the conflict as an example of the Thucydides trap."}'::jsonb, NULL, 'C', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '1-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• Researchers in a 2021 study wanted to determine the rate at which 17 languages conveyed both information and syllables.
• They calculated the bits of information conveyed per second (the IR, or information rate).
• The IR was found to be approximately consistent across the 17 languages (an average of 39 bits per second).
• They calculated the number of syllables spoken per second (the SR, or syllable rate).
• Spanish had the second-fastest SR (7.7 syllables per second).
• Vietnamese had the sixteenth-fastest SR (5.3 syllables per second).

The student wants to present an overview of the study''s findings.', NULL, 'Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"The 2021 study determined the information rate (IR) of 17 languages in bits of information conveyed per second.","B":"Researchers found that information was conveyed more quickly in Spanish, at 7.7 syllables per second, than in Vietnamese, at 5.3 syllables per second.","C":"Vietnamese had the sixteenth-fastest syllable rate, lower than that of Spanish, which had the second-fastest; however, Spanish had the lower information rate of the two.","D":"Though some of the languages differed in number of syllables spoken per second, all 17 conveyed information at roughly the same rate."}'::jsonb, NULL, 'D', NULL, NULL, 18)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 2, 'reading-writing', 'Reading and Writing — Module 2', 1920, 33)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '2-1', 1, 'mcq', 'Taking photographs in the mid-1800s was complicated and expensive, but this changed with the 1854 invention of the carte de visite, a small photo that cost little to make. Carte de visite photos helped to ______ photography: they made it easy and enjoyable for everyday people to have their pictures taken, and people at the time loved exchanging these small photos with friends and family.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"weaken","B":"praise","C":"popularize","D":"isolate"}'::jsonb, NULL, 'C', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '2-2', 2, 'mcq', 'Painter Alma W. Thomas was fascinated by the colors and shapes found in nature. The flowers and trees in the garden at her home in Washington, DC, ______ her work. For example, Thomas''s use of broken brushstrokes was inspired by the way that light would shine through the leaves of a tree in front of her house.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"restricted","B":"announced","C":"distracted","D":"influenced"}'::jsonb, NULL, 'D', NULL, NULL, 20)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '2-3', 3, 'mcq', 'In the 1990s, conservationists began planting more than 500,000 native trees in the habitat of the Azores bullfinch to boost the bird''s numbers. This approach was apparently ______: the Azores bullfinch''s population size increased from as few as 100 birds at the end of the 1980s to around 1,300 in 2023.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"amusing","B":"costly","C":"successful","D":"disastrous"}'::jsonb, NULL, 'C', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '2-4', 4, 'mcq', 'The recently observed gamma ray burst GRB 230307A lasted for 200 seconds, ______ for a burst generated by the merger of neutron stars. Bursts caused by neutron mergers typically last fewer than 2 seconds.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"a coincidence","B":"a reprieve","C":"an incident","D":"an oddity"}'::jsonb, NULL, 'D', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '2-5', 5, 'mcq', 'In 1776, the United States sent Benjamin Franklin to France to try to win the country''s support in the United States'' fight for independence from Great Britain. Franklin was very popular in France. This ______ surely helped him to convince France to assist the United States.', NULL, 'Which choice completes the text with the most logical and precise word or phrase?', '{"A":"thoughtfulness","B":"esteem","C":"controversy","D":"sincerity"}'::jsonb, NULL, 'B', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '2-6', 6, 'mcq', 'In the 1950s, scientists didn''t know much about the ocean floor. <u>Many scientists at the time believed that the ocean floor was mostly flat.</u> But geologist Marie Tharp and her research partner, Bruce Heezen, proved that this idea was wrong. Using sonar data collected from the Atlantic Ocean, Tharp and Heezen showed that the floor was filled with canyons, mountains, and valleys.', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It identifies a scientific belief that Tharp and Heezen showed to be wrong.","B":"It describes the design of Tharp and Heezen''s experiment.","C":"It emphasizes a disagreement between Tharp and Heezen.","D":"It presents data to support a claim that Tharp and Heezen made."}'::jsonb, NULL, 'A', NULL, NULL, 21)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '2-7', 7, 'mcq', 'In the early days of television in the 1940s, many people thought that US television programs would rely on the financial support of ad agencies and commercial sponsors, much like radio did. But advertisers hesitated to jump into a new space, <u>particularly at a time when the manufacturing of new television sets was stalled due to the US''s involvement in World War II</u>. Broadcasters, like the National Broadcasting Company (NBC), needed to persuade advertisers to support their programming despite not knowing whether there would be a robust television audience to begin with.', NULL, 'Which choice best describes the function of the underlined phrase in the text as a whole?', '{"A":"It compares the beginnings of radio programming with the beginnings of television programming in the United States.","B":"It identifies a specific reason behind some advertisers'' hesitance to support television.","C":"It describes how broadcasters attempted to convince advertisers to support television.","D":"It explains why a type of television programming was popular at the time."}'::jsonb, NULL, 'B', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '2-8', 8, 'mcq', 'The Bayeux Tapestry, from eleventh-century France, depicts 75 scenes over 250 feet of fabric. It was likely produced by workers embroidering in sections and then joining the resulting panels together. It''s plausible that the workshop that produced the tapestry had never produced one so large, and some researchers claim that a close examination of the joins—the places where the panels are stitched together—suggests that the workers developed and refined their joining process over the course of production. <u>For example, the first join the workers completed exhibits a clear misalignment of the borders of the two panels, whereas the later joins are virtually invisible.</u>', NULL, 'Which choice best describes the function of the underlined sentence in the text as a whole?', '{"A":"It identifies the people and events depicted in the Bayeux Tapestry.","B":"It supports an argument about the workers who produced the Bayeux Tapestry.","C":"It compares the Bayeux Tapestry with other tapestries from eleventh-century France.","D":"It describes how researchers determined where the Bayeux Tapestry was produced."}'::jsonb, NULL, 'B', NULL, NULL, 22)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '2-9', 9, 'mcq', 'Text 1
Little is known about how plate tectonics—wherein slabs of Earth''s crust move over, under, away from, and against one another—began. Some researchers contend that tectonic movements began around 3 billion years ago, often noting that computer models of Earth''s mantle temperature at the time indicate that the mantle would have been sufficiently molten to enable the plates to move.
Text 2
Ultimately, any plausible claim about the inception of tectonic movement must rest on empirical evidence from the geological record. Researcher Wriju Chowdhury and his team analyzed the geochemistry of zircon crystals to gain insight into the chemical composition of the magma from which the crystals formed and, based on the data, compellingly argue that plate tectonics may have been occurring as early as 4.2 billion years ago.', NULL, 'Based on the texts, how would the author of Text 2 most likely respond to what “some researchers contend” as described in Text 1?', '{"A":"By suggesting that the temperature of Earth''s mantle 3 billion years ago was likely insufficient to allow for the level of tectonic movement predicted by computer models","B":"By distinguishing between computer models of Earth''s mantle temperature that reliably predict the onset of plate tectonics and those that do not","C":"By indicating that computer models of Earth''s mantle temperature are still being improved such that new models tend to be much more reliable than their predecessors","D":"By asserting that a more definitive form of evidence than the computer models suggests a different timeline for the onset of plate tectonics on Earth"}'::jsonb, NULL, 'D', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '2-10', 10, 'mcq', 'Hevea brasiliensis, a tree in the Amazon rainforest, is the world''s main source of natural rubber. The tree produces a milky substance called latex that is used to make rubber. The bark of Hevea brasiliensis is helpful for the process of making rubber because it has a unique structure that makes it easy to collect latex. A network of tubes in the tree''s inner bark helps the latex to flow out easily when people make small cuts into the bark.', NULL, 'What feature of Hevea brasiliensis does the text say is helpful for the process of making rubber?', '{"A":"Its latex produces rubber of an especially high quality.","B":"Its bark has a unique structure that makes it easy to collect latex.","C":"It is able to grow in a wide variety of climates around the world.","D":"It is one of only two trees in the Amazon that produce latex."}'::jsonb, NULL, 'B', NULL, NULL, 23)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '2-11', 11, 'mcq', 'Conservationists worldwide are working to protect ecosystems from habitat destruction and biodiversity loss, and in many cases, initiatives that rely on natural features or processes can help address such challenges. In response to a rapidly dwindling population of blueback salmon, the Quinault Indian Nation (a tribe in Washington State) partnered with the conservation organization Wild Salmon Center to restore naturally occurring logjams in the Quinault River. The logjams create shady pools where the blueback salmon can rest and spawn, thus promoting blueback population recovery.', NULL, 'Which choice best states the main idea of the text?', '{"A":"A partnership between the Quinault Indian Nation and Wild Salmon Center shows the importance of collaborative approaches to preserving biodiversity.","B":"Nature-based approaches can be effective ways to achieve conservation goals.","C":"As indicated by a recent project, logjams help the blueback salmon thrive and reproduce.","D":"Scientists now realize that nature-based conservation methods offer better long-term solutions to environmental issues than methods that are not nature-based do."}'::jsonb, NULL, 'B', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '2-12', 12, 'mcq', 'Percentage of Bus Shelters with Shade in a County by Areas'' Highest Average Summer Surface Temperature

Highest average surface temperature (Fahrenheit) | Percentage of bus stops with shaded shelter
90.2° | 15%
97.7° | 22%
102.7° | 24%
111.2° | 28%
125.6° | 29%

A student is researching a bus system in a large county where surface temperatures vary by area and are hot in the summer. The student claims that all areas of the county should have more bus stops with shaded shelter, noting that the highest percentage of bus stops with shaded shelter for any area is only ______', NULL, 'Which choice most effectively uses data from the table to complete the student''s claim?', '{"A":"50%.","B":"15%.","C":"90%.","D":"29%."}'::jsonb, NULL, 'D', NULL, NULL, 24)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '2-13', 13, 'mcq', 'Total Areas and 2022 Populations of Smallest Arabian Peninsula Countries

Country | Total area (square miles) | Population
Kuwait | 6,880 | 4,268,873
Bahrain | 304 | 1,472,233
Qatar | 4,471 | 2,695,122

In terms of area and population, the three smallest Arabian Peninsula countries are Bahrain, Qatar, and Kuwait.', NULL, 'According to the table, what is the total area of Bahrain?', '{"A":"4,268,873 square miles","B":"4,471 square miles","C":"304 square miles","D":"6,880 square miles"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '2-14', 14, 'mcq', 'Janet Echelman is a sculptor and fiber artist. She has installed giant sculptures all over the world. Echelman uses bright and flowing materials, which mimic the wind. <u>However, while her sculptures appear as delicate as a breeze, they are actually very durable.</u>', NULL, 'Which quotation from an article about Echelman''s sculptures, if true, would most effectively illustrate the underlined claim?', '{"A":"“Echelman uses a special program that makes a 3D model of the sculpture.”","B":"“The first part of planning a new sculpture is done using paper and pencil, and then a digital program is used to finalize the design.”","C":"“The materials that Echelman uses to build her sculptures are both flexible and strong.”","D":"“Each sculpture is designed to reflect local landmarks from the area in which it is eventually installed.”"}'::jsonb, NULL, 'C', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '2-15', 15, 'mcq', 'Early Earth is thought to have been characterized by a stagnant lid tectonic regime, in which the upper lithosphere (the outer rocky layer) was essentially immobile and there was no interaction between the lithosphere and the underlying mantle. Researchers investigated the timing of the transition from a stagnant lid regime to a tectonic plate regime, in which the lithosphere is fractured into dynamic plates that in turn allow lithospheric and mantle material to mix. Examining chemical data from lithospheric and mantle-derived rocks ranging from 285 million to 3.8 billion years old, the researchers dated the transition to 3.2 billion years ago.', NULL, 'Which finding, if true, would most directly support the researchers'' conclusion?', '{"A":"Among rocks known to be older than 3.2 billion years, significantly more are mantle derived than lithospheric, but the opposite is true for the rocks younger than 3.2 billion years.","B":"Mantle-derived rocks older than 3.2 billion years show significantly more compositional diversity than lithospheric rocks older than 3.2 billion years do.","C":"There is a positive correlation between the age of lithospheric rocks and their chemical similarity to mantle-derived rocks, and that correlation increases significantly in strength at around 3.2 billion years old.","D":"Mantle-derived rocks younger than 3.2 billion years contain some material that is not found in older mantle-derived rocks but is found in older and contemporaneous lithospheric rocks."}'::jsonb, NULL, 'D', NULL, NULL, 25)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '2-16', 16, 'mcq', 'The Uto-Aztecan language family is divided into a northern branch, which includes the Shoshone language of present-day Idaho and Utah, and a southern one, whose best-known representative is Nahuatl, the language of the Aztec Empire in Mexico. Lexical similarities across the family, including of botanical terms, confirm descent from a single language spoken millennia ago, and the family''s geographical distribution suggests an origin in what is now the US Southwest. However, vocabulary pertaining to maize isn''t shared between northern and southern branches, despite the crop''s universal cultivation among Uto-Aztecan tribes. Given archaeological evidence that maize originated in Mexico and diffused northward into what became the US Southwest, some linguists reason that ______', NULL, 'Which choice most logically completes the text?', '{"A":"northern Uto-Aztecan tribes likely obtained the crop directly from a southern Uto-Aztecan tribe rather than from a non-Uto-Aztecan tribe.","B":"variation in maize-related vocabulary within each branch of the Uto-Aztecan family likely reflects regionally specific methods for cultivating the crop.","C":"southern Uto-Aztecan tribes likely acquired maize at roughly the same time as northern Uto-Aztecan tribes did, though from different sources.","D":"the family''s division into northern and southern branches likely preceded the acquisition of the crop by the Uto-Aztecan tribes."}'::jsonb, NULL, 'D', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '2-17', 17, 'mcq', 'Data collected by the Mars rover Curiosity at the Gale Crater''s Murray Formation are suggestive of hydrological deposition of sediment in the distant past. To characterize the nature of the depositional environment, Frances Rivera-Hernández et al. analyzed the grain size of Murray Formation sediment, finding that although there are intervals of coarse grains, most of the sediment consists of fine grains that show signs of cracking due to episodic desiccation. Rivera-Hernández et al. concluded that the coarse grains are sandstone, which tends to be deposited by flowing water, whereas the fine grains are mudstone, which is slowly deposited by settling out of suspension in low-flow water, leading the researchers to posit that ______', NULL, 'Which choice most logically completes the text?', '{"A":"although the area of the Murray Formation experienced a prolonged period of dryness that prevented a lake from forming, water flowing from a distant source was present.","B":"a lake existed at the Murray Formation for a prolonged period, though the lake occasionally experienced drying and there were periods in which one or more streams were present.","C":"one or more streams existed at the Murray Formation for an extended period until being replaced by a lake that persisted for only a brief period before permanently drying.","D":"a stream-fed lake was present at the Murray Formation for an extended period, and although the streams experienced occasional drying, the lake did not."}'::jsonb, NULL, 'B', NULL, NULL, 26)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '2-18', 18, 'mcq', 'An analysis by Alain Elayi and colleagues of coins minted in Sidon in the fifth and fourth centuries BCE reveals a change in their composition over time: while a coin from circa 450 BCE contains about 98% silver and 1% copper, a coin from 367 BCE (the end of Ba''alšillem II''s reign) contains 74.2% silver and 24.7% copper, giving it a relatively yellowish appearance that traders would have noticed. Because coins with a silver content below 80% were widely considered unsuitable for trade, Elayi et al. speculate that a crisis in confidence in the currency occurred in Sidon around 367 BCE, which was likely relieved—despite Sidon''s persistent oppressive financial obligations—as a result of Ba''alšillem II''s successor Abd''aštart I''s decision to ______', NULL, 'Which choice most logically completes the text?', '{"A":"proclaim that the percentage of silver in coins suitable for trade would be raised to a threshold higher than 80% .","B":"keep the amount of silver in Sidonian coins consistent with that in coins minted in 367 BCE but decrease their weight.","C":"begin minting heavier coins with a proportion of silver to copper similar to that in coins minted in 367 BCE.","D":"fund the mining of some copper deposits that were not available to Ba''alšillem II."}'::jsonb, NULL, 'B', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '2-19', 19, 'mcq', 'Nowadays, tug-of-war is usually seen as an informal game one might play at a picnic or in gym class. Surprisingly, the Olympic committee once decided ______ tug-of-war as an official Olympic event! Nations competed in the event at the Olympic Games from 1900 to 1920.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"included","B":"including","C":"include","D":"to include"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '2-20', 20, 'mcq', 'The Globe Theatre in London is a reconstruction of the famed venue where many of Shakespeare''s plays were first performed. In 1613, a prop cannon ______ during a performance and ignited the Globe''s thatched roof. No one was hurt, but in two hours the original Globe was gone.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"malfunctions","B":"will malfunction","C":"has malfunctioned","D":"malfunctioned"}'::jsonb, NULL, 'D', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '2-21', 21, 'mcq', 'Nigerian American artist Toyin Ojih Odutola uses black-ink pens to create highly detailed drawings of human figures. Her portrait of novelist Zadie ______ is displayed in the National Portrait Gallery in London.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"Smith:","B":"Smith—","C":"Smith","D":"Smith,"}'::jsonb, NULL, 'C', NULL, NULL, 27)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '2-22', 22, 'mcq', 'When a given industry—water and electricity are two well-known examples—carries high infrastructural start-up costs and other barriers that discourage competition, ______ of just one or two suppliers per municipality. Such industries are known as natural monopolies.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"these often consist","B":"they often consist","C":"it often consists","D":"this often consists"}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '2-23', 23, 'mcq', 'As the fourteenth US librarian of Congress, Carla Hayden has many responsibilities. These include overseeing the Library of Congress''s collections, which boast more than 162 million ______ the US Copyright Office, which registers copyright claims and advises Congress on copyright law; and appointing the US poet laureate.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"items managing","B":"items, managing","C":"items; managing","D":"items. Managing"}'::jsonb, NULL, 'C', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '2-24', 24, 'mcq', 'Digital artist Jung (Lulu) Chen primarily uses a suite of software tools to create illustrations for children''s books. To manifest the warm and welcoming atmospheres that are a signature of her ______ she occasionally relies on more traditional art techniques, such as painting with watercolors.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"work, though,","B":"work, though","C":"work; though,","D":"work, though;"}'::jsonb, NULL, 'A', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '2-25', 25, 'mcq', 'Chondrites are stony meteorites that are undifferentiated—that is, their contents have not melted and separated into distinct layers. They are hardly ______ many chondrites experience aqueous alteration as a result of exposure to fluids, as well as fracturing, veining, and localized melting due to collisions with other objects.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"pristine, though","B":"pristine, though;","C":"pristine; though","D":"pristine, though,"}'::jsonb, NULL, 'B', NULL, NULL, 28)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '2-26', 26, 'mcq', 'That the geographic center of North America lay in the state of North Dakota was conceded by all ______ establishing its precise coordinates proved more divisive.', NULL, 'Which choice completes the text so that it conforms to the conventions of Standard English?', '{"A":"involved:","B":"involved,","C":"involved","D":"involved;"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '2-27', 27, 'mcq', 'Famous for its four-degree tilt, the leaning Garisenda Tower is a popular attraction in Bologna''s city center. However, measurements taken in 2023 showed that the tower was rotating in a concerning way. ______ city officials closed the area around the tower so experts could explore solutions to stabilize the historical twelfth-century structure.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Similarly,","B":"As a result,","C":"For example,","D":"In comparison,"}'::jsonb, NULL, 'B', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 28, '2-28', 28, 'mcq', 'In 2021, a model developed by astrophysicist Catherine Zucker and her research team revealed that the same supernovas responsible for the creation and ongoing expansion of the Local Bubble—a 14-million-year-old cavity in the Milky Way—are likely responsible for the formation of new stars. ______ this model detailed how the bubble''s expansion trapped interstellar clouds of gas and dust that became stars upon their eventual collapse.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Hence,","B":"However,","C":"Admittedly,","D":"Specifically,"}'::jsonb, NULL, 'D', NULL, NULL, 29)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 29, '2-29', 29, 'mcq', 'Following the American Revolutionary War, North American foodways underwent a radical transformation, fueled in large part by spiking consumer demand for certain grains. The cultivation, trade, and transportation of maize and wheat, ______ reconfigured the continent''s existing regional foodways into a globally oriented food system.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"in particular,","B":"alternatively,","C":"by comparison,","D":"second of all,"}'::jsonb, NULL, 'A', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 30, '2-30', 30, 'mcq', 'When, in 2017, Cambridge University students Lucy Moss and Toby Marlow decided they wanted to develop a musical together, one of their goals was for their female actor friends to have good parts to play. ______ they created the show Six, a retelling of the history of King Henry VIII''s wives in which each of the six queens has a starring role.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"In other words,","B":"In summary,","C":"For example,","D":"To that end,"}'::jsonb, NULL, 'D', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 31, '2-31', 31, 'mcq', 'Mountain climbing routes that incorporate metal rungs and cables are known as via ferratas, from the Italian phrase for “iron path.” As climbing these routes has shifted from a mode of travel to a sporting activity, modern via ferratas are rarely designed to simply reach a summit. ______ new routes favor recreation over utility, aiming to provide a challenging climb or showcase dramatic scenery.', NULL, 'Which choice completes the text with the most logical transition?', '{"A":"Additionally,","B":"On the other hand,","C":"More often,","D":"Nonetheless,"}'::jsonb, NULL, 'C', NULL, NULL, 30)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 32, '2-32', 32, 'mcq', 'While researching a topic, a student has taken the following notes:
• Samuel Delany is a US writer known for his science fiction.
• Delany''s science fiction novel Babel-17 was published in 1966.
• The novel won a Nebula Award in 1967.
• The Nebula Awards are given each year to the best works of science fiction published in the US.', NULL, 'The student wants to indicate the title of a novel that won a Nebula Award. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"Babel-17, by Samuel Delany, won a Nebula Award in 1967.","B":"Samuel Delany published a science fiction novel in 1966.","C":"Samuel Delany is an award-winning US writer known for his science fiction.","D":"One of Samuel Delany''s novels was among the best works of science fiction published in the US."}'::jsonb, NULL, 'A', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 33, '2-33', 33, 'mcq', 'While researching a topic, a student has taken the following notes:
• Chiura Obata was a Japanese American artist who lived in California.
• Yosemite Falls is a notable painting by Obata.
• It uses a Japanese method of black ink painting called sumi-e.
• This painting was completed in 1930.', NULL, 'The student wants to indicate the year Yosemite Falls was completed. Which choice most effectively uses relevant information from the notes to accomplish this goal?', '{"A":"While living in California, Obata created black ink paintings.","B":"Obata, a Japanese American artist, created a notable painting.","C":"Yosemite Falls was completed in 1930.","D":"Obata used a Japanese painting method called sumi-e."}'::jsonb, NULL, 'C', NULL, NULL, 31)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 3, 'math', 'Math — Module 1', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '3-1', 1, 'mcq', 'The scatterplot shows the temperature, in degrees Fahrenheit ($\degree$F), and the distance above sea level, in feet, measured at 6 locations on Mount Jefferson. A line of best fit is also shown.', 'Scatterplot with x-axis ''Distance above sea level (feet)'' marked 0, 2,000, 4,000, 6,000, 8,000 and y-axis ''Temperature ($\degree$F)'' marked from 0 to 80 in increments of 10. Six data points are plotted with a downward-sloping line of best fit; at 0 feet the line is near 60$\degree$F and it decreases as distance increases.', 'At a distance of 4,000 feet above sea level, what is the temperature, in $\degree$F, predicted by the line of best fit?', '{"A":"47","B":"35","C":"25","D":"0"}'::jsonb, '/data/tests/cb-og-7/figures/m3-q1.png', 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '3-2', 2, 'mcq', NULL, NULL, 'Rectangle $P$ has an area of 72 square inches. If a rectangle with an area of 20 square inches is removed from rectangle $P$, what is the area, in square inches, of the resulting figure?', '{"A":"92","B":"84","C":"80","D":"52"}'::jsonb, NULL, 'D', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '3-3', 3, 'mcq', NULL, NULL, '$|p| + 61 = 65$

Which value is a solution to the given equation?', '{"A":"$\\frac{65}{61}$","B":"4","C":"126","D":"130"}'::jsonb, NULL, 'B', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '3-4', 4, 'mcq', NULL, NULL, 'Lorenzo purchased a box of cereal and some strawberries at the grocery store. Lorenzo paid \$2 for the box of cereal and \$1.90 per pound for the strawberries. If Lorenzo paid a total of \$9.60 for the box of cereal and the strawberries, which of the following equations can be used to find $p$, the number of pounds of strawberries Lorenzo purchased? (Assume there is no sales tax.)', '{"A":"$1.90p + 2 = 9.60$","B":"$1.90p - 2 = 9.60$","C":"$1.90 + 2p = 9.60$","D":"$1.90 - 2p = 9.60$"}'::jsonb, NULL, 'A', NULL, NULL, 32)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '3-5', 5, 'mcq', 'The bar graph summarizes the charge, in kilowatt-hours (kWh), a battery received each day for 15 days.', 'Bar graph with x-axis ''Charge (kWh)'' showing categories 0, 8, 9, 11, 16, 23 and y-axis ''Number of days'' marked from 0 to 7. Bars indicate how many days each charge amount occurred.', 'For how many of these 15 days did the battery receive a charge of 0 kWh?', '{"A":"0","B":"1","C":"4","D":"6"}'::jsonb, '/data/tests/cb-og-7/figures/m3-q5.png', 'D', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '3-6', 6, 'grid', NULL, NULL, 'A line in the $xy$-plane has a slope of 9 and passes through the point $(0, -5)$. The equation $y = px + r$ defines the line, where $p$ and $r$ are constants. What is the value of $p$ ?', NULL, NULL, '9', '["9"]'::jsonb, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '3-7', 7, 'grid', NULL, NULL, 'What is an $x$-coordinate of an $x$-intercept of the graph of $y = 3(x - 14)(x + 5)(x + 4)$ in the $xy$-plane?', NULL, NULL, '14', '["14","-5","-4"]'::jsonb, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '3-8', 8, 'mcq', 'The graph shown gives the estimated value, in dollars, of a tablet as a function of the number of months since it was purchased.', 'Line graph with x-axis ''Number of months after purchase'' marked 0, 4, 8, 12, 16, 20, 24 and y-axis ''Value (dollars)'' marked 50, 100, 150, 200, 250, 300, 350. The line decreases from a y-intercept near 225 at month 0 down toward lower values as months increase.', 'What is the best interpretation of the $y$-intercept of the graph in this context?', '{"A":"The estimated value of the tablet was \\$225 when it was purchased.","B":"The estimated value of the tablet 24 months after it was purchased was \\$225.","C":"The estimated value of the tablet had decreased by \\$225 in the 24 months after it was purchased.","D":"The estimated value of the tablet decreased by approximately 2.25% each year after it was purchased."}'::jsonb, '/data/tests/cb-og-7/figures/m3-q8.png', 'A', NULL, NULL, 33)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '3-9', 9, 'mcq', NULL, NULL, 'Triangles $EFG$ and $JKL$ are congruent, where $E$, $F$, and $G$ correspond to $J$, $K$, and $L$, respectively. The measure of angle $E$ is $45\degree$ and the measure of angle $F$ is $20\degree$. What is the measure of angle $J$ ?', '{"A":"$20\\degree$","B":"$45\\degree$","C":"$135\\degree$","D":"$160\\degree$"}'::jsonb, NULL, 'B', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '3-10', 10, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = \frac{1}{2}(x + 6)$. What is the value of $f(4)$ ?', '{"A":"20","B":"12","C":"10","D":"5"}'::jsonb, NULL, 'D', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '3-11', 11, 'mcq', 'The graph of a system of an absolute value function and a linear function is shown.', 'Graph in the $xy$-plane showing a V-shaped absolute value function and a straight line. The x-axis is marked from $-8$ to $3$ and the y-axis from 1 to 9. The two graphs intersect at a single point near $(-3, 4)$.', 'What is the solution $(x, y)$ to this system of two equations?', '{"A":"$(0, 8)$","B":"$\\left(\\frac{7}{2}, \\frac{9}{2}\\right)$","C":"$\\left(-\\frac{7}{2}, \\frac{9}{2}\\right)$","D":"$(-3, 4)$"}'::jsonb, '/data/tests/cb-og-7/figures/m3-q11.png', 'C', NULL, NULL, 34)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '3-12', 12, 'mcq', '$y = 6x + 3$

One of the two equations in a system of linear equations is given. The system has infinitely many solutions.', NULL, 'Which equation could be the second equation in this system?', '{"A":"$y = 2(6x) + 3$","B":"$y = 2(6x + 3)$","C":"$2(y) = 2(6x) + 3$","D":"$2(y) = 2(6x + 3)$"}'::jsonb, NULL, 'D', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '3-13', 13, 'grid', NULL, NULL, 'If $\frac{6}{7}p + 18 = 54$, what is the value of $7p$ ?', NULL, NULL, '294', '["294"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '3-14', 14, 'grid', '$y = 9x + 12$
$x + 7y = 20$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $y$ ?', NULL, NULL, '3', '["3"]'::jsonb, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '3-15', 15, 'mcq', NULL, NULL, 'A circle in the $xy$-plane has the equation $(x - 13)^2 + (y - k)^2 = 64$. Which of the following gives the center of the circle and its radius?', '{"A":"The center is at $(13, k)$ and the radius is 8.","B":"The center is at $(k, 13)$ and the radius is 8.","C":"The center is at $(k, 13)$ and the radius is 64.","D":"The center is at $(13, k)$ and the radius is 64."}'::jsonb, NULL, 'A', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '3-16', 16, 'mcq', NULL, NULL, 'The function $f$ is defined by $f(x) = |x - 4x|$. What value of $a$ satisfies $f(5) - f(a) = -15$ ?', '{"A":"$-20$","B":"5","C":"10","D":"45"}'::jsonb, NULL, 'C', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '3-17', 17, 'mcq', NULL, NULL, 'For the exponential function $f$, the value of $f(0)$ is $c$, where $c$ is a constant. Of the following equations that define the function $f$, which equation shows the value of $c$ as the coefficient or the base?', '{"A":"$f(x) = 22(1.5)^{x+1}$","B":"$f(x) = 33(1.5)^x$","C":"$f(x) = 49.5(1.5)^{x-1}$","D":"$f(x) = 74.25(1.5)^{x-2}$"}'::jsonb, NULL, 'B', NULL, NULL, 35)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '3-18', 18, 'mcq', NULL, NULL, 'The function $f(t) = 40{,}000(2)^{\frac{t}{790}}$ gives the number of bacteria in a population $t$ minutes after an initial observation. How much time, in minutes, does it take for the number of bacteria in the population to double?', '{"A":"2","B":"790","C":"1,580","D":"40,000"}'::jsonb, NULL, 'B', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '3-19', 19, 'mcq', '$\frac{12}{n} - \frac{2}{t} = \frac{2}{w}$

The given equation relates the variables $n$, $t$, and $w$, where $n > 0$, $t > 0$, and $w > t$.', NULL, 'Which expression is equivalent to $n$ ?', '{"A":"$12tw$","B":"$6(t - w)$","C":"$\\frac{w - t}{6tw}$","D":"$\\frac{6tw}{w - t}$"}'::jsonb, NULL, 'D', NULL, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '3-20', 20, 'grid', 'During a study, the temperature, in degrees Celsius ($\degree$C), of the air in a chamber was recorded to the nearest integer at certain times. The scatterplot shows the recorded temperature $y$, in $\degree$C, of the air in the chamber $x$ minutes after the start of the study.', 'Scatterplot with x-axis ''Time (minutes)'' marked 0 through 8 and y-axis ''Temperature ($\degree$C)'' marked in increments of 2 from 0 to 30. Data points show recorded temperatures at various times.', 'What was the average rate of change, in $\degree$C per minute, of the recorded temperature of the air in the chamber from $x = 5$ to $x = 7$ ?', NULL, '/data/tests/cb-og-7/figures/m3-q20.png', '5', '["5"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '3-21', 21, 'grid', NULL, NULL, 'In August, a car dealer completed 15 more than 3 times the number of sales the car dealer completed in September. In August and September, the car dealer completed 363 sales. How many sales did the car dealer complete in September?', NULL, NULL, '87', '["87"]'::jsonb, NULL, 36)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '3-22', 22, 'mcq', NULL, NULL, 'Points $Q$ and $R$ lie on a circle with center $P$. The radius of this circle is 9 inches. Triangle $PQR$ has a perimeter of 31 inches. What is the length, in inches, of $\overline{QR}$ ?', '{"A":"$13\\sqrt{2}$","B":"13","C":"$9\\sqrt{2}$","D":"9"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '3-23', 23, 'mcq', NULL, NULL, 'In a set of four consecutive odd integers, where the integers are ordered from least to greatest, the first integer is represented by $x$. The product of 12 and the fourth odd integer is at most 26 less than the sum of the first and third odd integers. Which inequality represents this situation?', '{"A":"$12(x + 6) \\le x + (x + 4) - 26$","B":"$12(x + 6) \\ge 26 - (x + (x + 4))$","C":"$12(x + 4) \\le x + (x + 3) - 26$","D":"$12(x + 4) \\ge 26 - (x + (x + 3))$"}'::jsonb, NULL, 'A', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '3-24', 24, 'mcq', 'The table shows three values of $x$ and their corresponding values of $y$, where $s$ is a constant. There is a linear relationship between $x$ and $y$. Table: column headings $x$ and $y$; rows: ($-2s$, 24), ($-s$, 21), ($s$, 15).', NULL, 'Which of the following equations represents this relationship?', '{"A":"$sx + 3y = 18s$","B":"$3x + sy = 18s$","C":"$3x + sy = 18$","D":"$sx + 3y = 18$"}'::jsonb, NULL, 'B', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '3-25', 25, 'mcq', NULL, NULL, 'Which of the following expressions is equivalent to $(\sin 24\degree)(\cos 66\degree) + (\cos 24\degree)(\sin 66\degree)$ ?', '{"A":"$2(\\cos 66\\degree)(\\sin 24\\degree)$","B":"$2(\\cos 66\\degree) + 2(\\cos 24\\degree)$","C":"$(\\cos 66\\degree)^2 + (\\cos 24\\degree)^2$","D":"$(\\cos 66\\degree)^2 + (\\sin 24\\degree)^2$"}'::jsonb, NULL, 'C', NULL, NULL, 37)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '3-26', 26, 'mcq', NULL, NULL, 'The cost of renting a carpet cleaner is \$52 for the first day and \$26 for each additional day. Which of the following functions gives the cost $C(d)$, in dollars, of renting the carpet cleaner for $d$ days, where $d$ is a positive integer?', '{"A":"$C(d) = 26d + 26$","B":"$C(d) = 26d + 52$","C":"$C(d) = 52d - 26$","D":"$C(d) = 52d + 78$"}'::jsonb, NULL, 'A', NULL, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '3-27', 27, 'grid', '$f(x) = (x - 2)(x + 15)$', NULL, 'The function $f$ is defined by the given equation. For what value of $x$ does $f(x)$ reach its minimum?', NULL, NULL, '-13/2', '["-13/2","-6.5"]'::jsonb, NULL, 38)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;

  INSERT INTO public.test_modules (test_id, position, section, label, time_limit_seconds, question_count)
  VALUES (v_test, 4, 'math', 'Math — Module 2', 2100, 27)
  ON CONFLICT (test_id, position) DO UPDATE SET section=EXCLUDED.section, label=EXCLUDED.label,
    time_limit_seconds=EXCLUDED.time_limit_seconds, question_count=EXCLUDED.question_count
  RETURNING id INTO v_mod;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 1, '4-1', 1, 'mcq', NULL, NULL, 'A total of 165 people contributed to a charity event as either a donor or a volunteer. 130 people contributed as a donor. How many people contributed as a volunteer?', '{"A":"35","B":"130","C":"165","D":"330"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 2, '4-2', 2, 'mcq', NULL, NULL, 'There are 250 trees in a park. Of these trees, 6% are birch trees. How many birch trees are in the park?', '{"A":"6","B":"15","C":"75","D":"244"}'::jsonb, NULL, 'B', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 3, '4-3', 3, 'mcq', NULL, 'An upward-opening parabola on an xy-coordinate plane. The x-axis ranges from about -2 to 2 and the y-axis is labeled from -1 to 12. The curve''s lowest point (vertex) is at (0, 2), and the parabola rises symmetrically on both sides, passing through about (-2, 10) and (2, 10).', 'The graph of the quadratic function $y = f(x)$ is shown. What is the vertex of the graph?', '{"A":"$(0, -2)$","B":"$(0, -3)$","C":"$(0, 2)$","D":"$(0, 3)$"}'::jsonb, '/data/tests/cb-og-7/figures/m4-q3.png', 'C', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 4, '4-4', 4, 'mcq', NULL, NULL, 'The number of raccoons in a 131-square-mile area is estimated to be 2,358. What is the estimated population density, in raccoons per square mile, of this area?', '{"A":"18","B":"131","C":"149","D":"2,376"}'::jsonb, NULL, 'A', NULL, NULL, 44)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 5, '4-5', 5, 'mcq', '$-11, -9, 26$', NULL, 'A data set of three numbers is shown. If a number from this data set is selected at random, what is the probability of selecting a positive number?', '{"A":"$0$","B":"$\\frac{1}{3}$","C":"$\\frac{2}{3}$","D":"$1$"}'::jsonb, NULL, 'B', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 6, '4-6', 6, 'grid', '$f(x) = 45x + 600$', NULL, 'The function $f$ gives the monthly fee $f(x)$, in dollars, a facility charges to keep $x$ crates in storage. What is the monthly fee, in dollars, the facility charges to keep 50 crates in storage?', NULL, NULL, '2850', '["2850"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 7, '4-7', 7, 'grid', NULL, NULL, 'The function $f$ is defined by $f(x) = 5\left(\frac{1}{4} - x\right)^2 + \frac{11}{4}$. What is the value of $f\left(\frac{1}{4}\right)$?', NULL, NULL, '11/4', '["11/4","2.75"]'::jsonb, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 8, '4-8', 8, 'mcq', NULL, NULL, 'If $8x = 6$, what is the value of $72x$?', '{"A":"3","B":"15","C":"54","D":"57"}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 9, '4-9', 9, 'mcq', NULL, NULL, 'Which expression is equivalent to $23x^3 + 2x^2 + 9x$?', '{"A":"$23x(x^2 + 2x + 9)$","B":"$9x(23x^3 + 2x^2 + 1)$","C":"$x(23x^2 + 2x + 9)$","D":"$34(x^3 + x^2 + x)$"}'::jsonb, NULL, 'C', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 10, '4-10', 10, 'mcq', NULL, NULL, 'Which expression is equivalent to $(9x^3 + 5x + 7) + (6x^3 + 5x^2 - 5)$?', '{"A":"$15x^6 + 5x^2 - 5x - 35$","B":"$15x^3 + 10x^2 + 2$","C":"$15x^6 + 5x^2 + 5x + 2$","D":"$15x^3 + 5x^2 + 5x + 2$"}'::jsonb, NULL, 'D', NULL, NULL, 45)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 11, '4-11', 11, 'mcq', NULL, NULL, 'At a state fair, attendees can win tokens that are worth a different number of points depending on the shape. One attendee won $S$ square tokens and $C$ circle tokens worth a total of 1,120 points. The equation $80S + 90C = 1{,}120$ represents this situation. How many more points is a circle token worth than a square token?', '{"A":"950","B":"90","C":"80","D":"10"}'::jsonb, NULL, 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 12, '4-12', 12, 'mcq', NULL, 'A scatterplot on an xy-coordinate plane. The x-axis is labeled from 1 to 7 and the y-axis from 2 to 14 (gridlines every 2 units). About a dozen data points scatter upward from lower left to upper right. A straight line of best fit rises through the points, passing through roughly (0, 1.5) and (7, 14.5), giving a positive slope of approximately 2 (slightly under).', 'In the given scatterplot, a line of best fit for the data is shown. Which of the following is closest to the slope of the line of best fit shown?', '{"A":"$0$","B":"$\\frac{1}{2}$","C":"$1$","D":"$2$"}'::jsonb, '/data/tests/cb-og-7/figures/m4-q12.png', 'D', NULL, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 13, '4-13', 13, 'grid', NULL, NULL, 'A circle has a radius of 2.1 inches. The area of the circle is $b\pi$ square inches, where $b$ is a constant. What is the value of $b$?', NULL, NULL, '4.41', '["4.41","441/100"]'::jsonb, NULL, 46)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 14, '4-14', 14, 'grid', NULL, NULL, 'In triangle $XYZ$, angle $Y$ is a right angle, point $P$ lies on $\overline{XZ}$, and point $Q$ lies on $\overline{YZ}$ such that $\overline{PQ}$ is parallel to $\overline{XY}$. If the measure of angle $XZY$ is $63°$, what is the measure, in degrees, of angle $XPQ$?', NULL, NULL, '153', '["153"]'::jsonb, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 15, '4-15', 15, 'mcq', NULL, NULL, 'An investment account was opened with an initial value of $890. The value of the account doubled every 10 years. Which equation represents the value of the account $M(t)$, in dollars, $t$ years after the account was opened?', '{"A":"$M(t) = 890\\left(\\frac{1}{2}\\right)^{\\frac{t}{10}}$","B":"$M(t) = 890\\left(\\frac{1}{10}\\right)^{\\frac{t}{2}}$","C":"$M(t) = 890(2)^{\\frac{t}{10}}$","D":"$M(t) = 890(10)^{\\frac{t}{2}}$"}'::jsonb, NULL, 'C', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 16, '4-16', 16, 'mcq', '$y < x$
$x < 22$', NULL, 'For which of the following tables are all the values of $x$ and their corresponding values of $y$ solutions to the given system of inequalities?', '{"A":"A table with columns x and y and rows: (19, 18), (20, 19), (21, 20)","B":"A table with columns x and y and rows: (19, 20), (20, 21), (21, 22)","C":"A table with columns x and y and rows: (23, 22), (24, 23), (25, 24)","D":"A table with columns x and y and rows: (23, 24), (24, 25), (25, 26)"}'::jsonb, NULL, 'A', NULL, NULL, 47)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 17, '4-17', 17, 'mcq', NULL, NULL, 'Which expression is equivalent to $\frac{h^{15}q^7}{h^5 q^{21}}$, where $h > 0$ and $q > 0$?', '{"A":"$\\frac{h^{10}}{q^{14}}$","B":"$\\frac{h^3}{q^3}$","C":"$h^{10}q^{14}$","D":"$h^3 q^3$"}'::jsonb, NULL, 'A', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 18, '4-18', 18, 'mcq', '$3y = 4x + 17$
$-3y = 9x - 23$', NULL, 'The solution to the given system of equations is $(x, y)$. What is the value of $39x$?', '{"A":"$-18$","B":"$-6$","C":"$6$","D":"$18$"}'::jsonb, NULL, 'D', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 19, '4-19', 19, 'mcq', '$h(t) = -16t^2 + b$', NULL, 'The function $h$ estimates an object''s height, in feet, above the ground $t$ seconds after the object is dropped, where $b$ is a constant. The function estimates that the object is 3,364 feet above the ground when it is dropped at $t = 0$. Approximately how many seconds after being dropped does the function estimate the object will hit the ground?', '{"A":"7.25","B":"14.50","C":"105.13","D":"210.25"}'::jsonb, NULL, 'B', NULL, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 20, '4-20', 20, 'grid', '$2x^2 - 8x - 7 = 0$', NULL, 'One solution to the given equation can be written as $\frac{8 - \sqrt{k}}{4}$, where $k$ is a constant. What is the value of $k$?', NULL, NULL, '120', '["120"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 21, '4-21', 21, 'grid', NULL, NULL, 'A line intersects two parallel lines, forming four acute angles and four obtuse angles. The measure of one of the acute angles is $(9x - 560)°$. The sum of the measures of one of the acute angles and three of the obtuse angles is $(-18x + w)°$. What is the value of $w$?', NULL, NULL, '1660', '["1660"]'::jsonb, NULL, 48)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 22, '4-22', 22, 'mcq', 'A table titled with columns x and f(x) shows three rows: x = -4, f(x) = 0; x = -19/5, f(x) = 1; x = -18/5, f(x) = 2.', NULL, 'For the linear function $f$, the table shows three values of $x$ and their corresponding values of $f(x)$. If $h(x) = f(x) - 13$, which equation defines $h$?', '{"A":"$h(x) = 5x - 4$","B":"$h(x) = 5x + 7$","C":"$h(x) = 5x + 9$","D":"$h(x) = 5x + 20$"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 23, '4-23', 23, 'mcq', NULL, NULL, 'The linear function $g$ is defined by $g(x) = b - 15x$, where $b$ is a constant. If $g(c + 7) = \frac{c}{4}$, where $c$ is a constant, which of the following expressions represents the value of $b$?', '{"A":"$\\frac{15c}{4}$","B":"$\\frac{19c}{4} + 7$","C":"$\\frac{61c}{4} + 105$","D":"$15c + 105$"}'::jsonb, NULL, 'C', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 24, '4-24', 24, 'mcq', NULL, NULL, 'In triangle $XYZ$, angle $Z$ is a right angle and the length of $\overline{YZ}$ is 24 units. If $\tan X = \frac{12}{35}$, what is the perimeter, in units, of triangle $XYZ$?', '{"A":"188","B":"168","C":"84","D":"71"}'::jsonb, NULL, 'B', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 25, '4-25', 25, 'mcq', '$x^2 + 14x + y^2 = 6y + 109$', NULL, 'In the xy-plane, the graph of the given equation is a circle. What is the length of the circle''s radius?', '{"A":"$\\sqrt{109}$","B":"$\\sqrt{149}$","C":"$\\sqrt{167}$","D":"$\\sqrt{341}$"}'::jsonb, NULL, 'C', NULL, NULL, 49)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 26, '4-26', 26, 'mcq', NULL, NULL, 'The speed of a vehicle is increasing at a rate of 7.3 meters per second squared. What is this rate, in miles per minute squared, rounded to the nearest tenth? (Use 1 mile = 1,609 meters.)', '{"A":"0.3","B":"16.3","C":"195.8","D":"220.4"}'::jsonb, NULL, 'B', NULL, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
  INSERT INTO public.test_questions (module_id, position, ref, number, type, passage, passage_alt, stem, choices, figure, correct_answer, accepted, domain, source_page)
  VALUES (v_mod, 27, '4-27', 27, 'grid', '$y = -2.5$
$y = x^2 + 8x + k$', NULL, 'In the given system of equations, $k$ is a positive integer constant. The system has no real solutions. What is the least possible value of $k$?', NULL, NULL, '14', '["14"]'::jsonb, NULL, 50)
  ON CONFLICT (module_id, position) DO UPDATE SET ref=EXCLUDED.ref, number=EXCLUDED.number, type=EXCLUDED.type,
    passage=EXCLUDED.passage, passage_alt=EXCLUDED.passage_alt, stem=EXCLUDED.stem, choices=EXCLUDED.choices,
    figure=EXCLUDED.figure, correct_answer=EXCLUDED.correct_answer, accepted=EXCLUDED.accepted,
    domain=EXCLUDED.domain, source_page=EXCLUDED.source_page;
END $seed$;
