const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const STUDENTS_DB = '2ee43f2a-920f-8035-80ee-000bdbcec5ea';
const JOURNAL_DB  = '2f543f2a-920f-80f3-9631-000b982f872d';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { action, data } = JSON.parse(event.body || '{}');

  try {

    // 학생 목록 불러오기
    if (action === 'getStudents') {
      const res = await notion.databases.query({
        database_id: STUDENTS_DB,
        filter: {
          or: [
            { property: '상태', status: { equals: '재원' } },
            { property: '상태', status: { equals: '개별 수업' } },
          ],
        },
        sorts: [{ property: '이름', direction: 'ascending' }],
      });

      const students = res.results.map(p => ({
        id:     p.id,
        name:   p.properties['이름']?.title?.[0]?.plain_text || '이름없음',
        grade:  p.properties['학년']?.select?.name || '',
        school: p.properties['학교']?.select?.name || '',
      }));

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, students }),
      };
    }

    // 학습 일지에 오답노트 기록
    if (action === 'addJournalEntry') {
      const {
        studentId, studentName, noteTitle,
        today, subjects, problemCount, problemNums, books,
      } = data;

      // 해당 학생의 학습 일지 페이지 찾기
      const journalRes = await notion.databases.query({
        database_id: JOURNAL_DB,
        filter: {
          property: '학생 관리',
          relation: { contains: studentId },
        },
        sorts: [{ timestamp: 'created_time', direction: 'descending' }],
        page_size: 1,
      });

      let journalPageId;

      if (journalRes.results.length > 0) {
        journalPageId = journalRes.results[0].id;
      } else {
        const newPage = await notion.pages.create({
          parent: { database_id: JOURNAL_DB },
          properties: {
            '이름':     { title:    [{ text: { content: `${studentName} 학습 일지` } }] },
            '학생 관리': { relation: [{ id: studentId }] },
          },
        });
        journalPageId = newPage.id;
      }

      const blocks = [
        { type: 'divider', divider: {} },
        {
          type: 'heading_3',
          heading_3: {
            rich_text: [{ text: { content: `📝 ${today} — ${noteTitle}` } }],
            color: 'blue_background',
          },
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `과목: ${subjects}` } }] },
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `교재: ${books || '—'}` } }] },
        },
        {
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `문제 수: ${problemCount}문제` } }] },
        },
      ];

      if (problemNums) {
        blocks.push({
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `문제 번호: ${problemNums}` } }] },
        });
      }

      await notion.blocks.children.append({
        block_id: journalPageId,
        children: blocks,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: '알 수 없는 action' }),
    };

  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: e.message }),
    };
  }
};
