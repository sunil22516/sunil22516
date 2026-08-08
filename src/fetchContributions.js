// Fetches a user's contribution calendar and normalizes it into a flat grid
// of { x, y, date, count, level } cells, where x = week index (0..N-1),
// y = weekday (0=Sun..6=Sat), and level is 0-4 like GitHub's own shading.

const GRAPHQL_QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              weekday
            }
          }
        }
      }
    }
  }
`;

// Bucket raw counts into 0-4 levels the way GitHub roughly does: relative to
// the user's own max day, not a fixed global scale (so a light committer's
// graph still shows visual variation instead of one flat color).
function levelFromCount(count, max) {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  const ratio = count / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

async function fetchViaGraphQL(username, token) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: GRAPHQL_QUERY, variables: { login: username } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL request failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GitHub GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }

  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
  const max = Math.max(
    1,
    ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount))
  );

  const cells = [];
  weeks.forEach((week, x) => {
    week.contributionDays.forEach((day) => {
      cells.push({
        x,
        y: day.weekday,
        date: day.date,
        count: day.contributionCount,
        level: levelFromCount(day.contributionCount, max),
      });
    });
  });

  return { cells, weekCount: weeks.length };
}

async function fetchViaPublicApi(username) {
  // https://github-contributions-api.jogruber.de -- unofficial, unauthenticated,
  // handy for trying the project out without setting up a token. Already
  // returns a 0-4 level per day so we can use it directly.
  const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`);
  if (!res.ok) {
    throw new Error(`Public contributions API request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const days = json.contributions;

  // Re-derive week/weekday grid coordinates from the date list, anchored on
  // the first Sunday on/before the first date, same convention GitHub uses.
  const first = new Date(days[0].date + "T00:00:00Z");
  const anchor = new Date(first);
  anchor.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay());

  const cells = days.map((d) => {
    const date = new Date(d.date + "T00:00:00Z");
    const weekday = date.getUTCDay();
    const x = Math.floor((date - anchor) / (7 * 24 * 3600 * 1000));
    return { x, y: weekday, date: d.date, count: d.count, level: d.level };
  });

  const weekCount = Math.max(...cells.map((c) => c.x)) + 1;
  return { cells, weekCount };
}

export async function getContributions(username, token) {
  if (token) {
    return fetchViaGraphQL(username, token);
  }
  return fetchViaPublicApi(username);
}
